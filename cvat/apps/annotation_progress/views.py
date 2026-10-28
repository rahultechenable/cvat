# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import textwrap

from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.response import Response

from cvat.apps.engine.models import Job

from .permissions import AnnotationProgressPermission
from .progress import get_job_annotation_progress
from .serializers import JobAnnotationProgressSerializer


@extend_schema(tags=["annotation_progress"])
class AnnotationProgressViewSet(viewsets.GenericViewSet, mixins.RetrieveModelMixin):
    queryset = Job.objects.select_related("segment__task__data", "segment__task__project")
    filter_backends = []  # a single job is retrieved, there is nothing to filter
    iam_supports_organization_params = False
    iam_permission_class = AnnotationProgressPermission
    serializer_class = JobAnnotationProgressSerializer

    @extend_schema(
        summary="Get the annotation progress of a job",
        description=textwrap.dedent("""\
            Progress is measured by position: frames up to the last annotated one
            count as done, including the empty frames the annotator skipped,
            and annotation resumes on the next frame.
        """),
        responses={"200": JobAnnotationProgressSerializer},
    )
    def retrieve(self, request, pk: int):
        job = self.get_object()
        progress = get_job_annotation_progress(job)

        return Response(
            JobAnnotationProgressSerializer(
                {
                    "job": job.id,
                    "total": progress.total,
                    "annotated": progress.annotated,
                    "remaining": progress.remaining,
                    "with_annotations": progress.with_annotations,
                    "last_annotated_frame": progress.last_annotated_frame,
                    "resume_frame": progress.resume_frame,
                }
            ).data
        )
