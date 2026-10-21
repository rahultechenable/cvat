# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import base64
import re
import textwrap
from urllib.parse import quote

import requests
from django.conf import settings
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response

from cvat.apps.engine.log import ServerLogManager
from cvat.apps.engine.media_io.frame_provider import TaskFrameProvider
from cvat.apps.engine.models import DimensionType, Job, Label, LabelType
from cvat.utils.http import make_requests_session

from .permissions import BoxAssistPermission
from .serializers import (
    BoxAssistModelListSerializer,
    BoxAssistSuggestRequestSerializer,
    BoxAssistSuggestResponseSerializer,
)

slogger = ServerLogManager(__name__)


class BoxAssistServiceError(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "The Box Assist service is not available"
    default_code = "box_assist_unavailable"


def _call_service(method: str, path: str, **kwargs) -> dict | list:
    url = settings.BOX_ASSIST_URL.rstrip("/") + path
    try:
        with make_requests_session() as session:
            response = session.request(method, url, timeout=settings.BOX_ASSIST_TIMEOUT, **kwargs)
    except requests.RequestException as ex:
        slogger.glob.warning("Box Assist service request failed: %s", ex)
        raise BoxAssistServiceError(
            f"The Box Assist service is not available at {settings.BOX_ASSIST_URL}"
        )

    if not response.ok:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text

        error = BoxAssistServiceError(f"Box Assist service error: {detail}")
        if response.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND):
            error = ValidationError({"model": detail})
        raise error

    return response.json()


def _normalize_label_name(name: str) -> str:
    return re.sub(r"[\s_\-]+", " ", name).strip().lower()


def _match_labels(model_labels: set[str], job: Job) -> dict[str, Label]:
    db_labels = {
        _normalize_label_name(label.name): label
        for label in job.get_labels()
        if label.type in (LabelType.ANY, LabelType.RECTANGLE)
    }

    return {
        model_label: db_labels[_normalize_label_name(model_label)]
        for model_label in model_labels
        if _normalize_label_name(model_label) in db_labels
    }


@extend_schema(tags=["box_assist"])
class BoxAssistViewSet(viewsets.ViewSet):
    iam_supports_organization_params = False
    iam_permission_class = BoxAssistPermission
    serializer_class = None

    @extend_schema(
        summary="List the models available for Box Assist",
        parameters=[
            OpenApiParameter(
                "refresh",
                type=OpenApiTypes.BOOL,
                description="Search the model directories again",
                required=False,
            )
        ],
        responses={"200": BoxAssistModelListSerializer},
    )
    @action(detail=False, methods=["GET"])
    def models(self, request):
        refresh = request.query_params.get("refresh", "").lower() in ("1", "true")
        result = _call_service("GET", "/models", params={"refresh": "true"} if refresh else None)
        return Response(BoxAssistModelListSerializer(result).data)

    @extend_schema(
        summary="Get box suggestions for a job frame",
        description=textwrap.dedent("""\
            Runs a Box Assist model on the frame and returns the detected boxes,
            mapped to the job labels by name. Nothing is saved: the client decides
            which suggestions to turn into annotations.
        """),
        request=BoxAssistSuggestRequestSerializer,
        responses={"200": BoxAssistSuggestResponseSerializer},
    )
    @action(detail=False, methods=["POST"])
    def suggest(self, request):
        request_serializer = BoxAssistSuggestRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        params = request_serializer.validated_data

        job = Job.objects.select_related("segment__task__data").get(id=params["job"])
        task = job.segment.task
        frame = params["frame"]

        if task.dimension != DimensionType.DIM_2D:
            raise ValidationError("Box Assist supports only 2D tasks")
        if not job.segment.contains_frame(frame) or frame in task.data.deleted_frames:
            raise ValidationError({"frame": f"Frame {frame} is not available in job {job.id}"})

        image = TaskFrameProvider(task).get_frame(frame).data.getvalue()
        result = _call_service(
            "POST",
            f"/models/{quote(params['model'], safe='')}/predict",
            json={"image": base64.b64encode(image).decode("utf-8"), "conf": params["conf"]},
        )

        detections = result["detections"]
        label_map = _match_labels({d["label"] for d in detections}, job)

        suggestions = [
            {
                "label_id": label_map[d["label"]].id,
                "model_label": d["label"],
                "confidence": d["confidence"],
                "points": d["box"],
            }
            for d in detections
            if d["label"] in label_map
        ]
        unmatched_labels = sorted({d["label"] for d in detections} - label_map.keys())

        return Response(
            BoxAssistSuggestResponseSerializer(
                {
                    "model": params["model"],
                    "frame": frame,
                    "suggestions": suggestions,
                    "unmatched_labels": unmatched_labels,
                }
            ).data
        )
