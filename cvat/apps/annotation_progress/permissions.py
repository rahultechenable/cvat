# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from cvat.apps.engine.models import Job
from cvat.apps.engine.permissions import JobPermission
from cvat.apps.iam.permissions import OpenPolicyAgentPermission


class AnnotationProgressPermission(OpenPolicyAgentPermission):
    """
    Annotation progress has no OPA rules of its own: anyone who can see a job
    can see how far its annotation has got, so the check is delegated to the job rules.
    """

    @classmethod
    def create(cls, request, view, obj, iam_context):
        if not isinstance(obj, Job):
            return []

        return [JobPermission(**iam_context, obj=obj, scope=JobPermission.Scopes.VIEW)]

    @classmethod
    def _get_scopes(cls, request, view, obj):
        return []

    def get_resource(self):
        return None
