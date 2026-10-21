# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from rest_framework.exceptions import ValidationError

from cvat.apps.engine.models import Job
from cvat.apps.engine.permissions import JobPermission
from cvat.apps.iam.permissions import OpenPolicyAgentPermission, get_iam_context


class BoxAssistPermission(OpenPolicyAgentPermission):
    """
    Box Assist has no OPA rules of its own: getting suggestions for a job requires the same
    rights as annotating it, so the checks are delegated to the existing job rules.
    """

    @classmethod
    def create(cls, request, view, obj, iam_context):
        if view.action != "suggest":
            # the model list contains no user data, any authenticated user can see it
            return []

        job_id = request.data.get("job")
        try:
            job = Job.objects.select_related("segment__task").get(id=job_id)
        except (Job.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"job": f"Job {job_id} doesn't exist"})

        job_iam_context = get_iam_context(request, job)
        return [
            JobPermission(**job_iam_context, obj=job, scope=JobPermission.Scopes.VIEW_DATA),
            JobPermission(
                **job_iam_context, obj=job, scope=JobPermission.Scopes.UPDATE_ANNOTATIONS
            ),
        ]

    @classmethod
    def _get_scopes(cls, request, view, obj):
        return []

    def get_resource(self):
        return None
