# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from rest_framework import routers

from .views import AnnotationProgressViewSet

router = routers.DefaultRouter(trailing_slash=False)
router.register(
    "annotation_progress/jobs", AnnotationProgressViewSet, basename="annotation_progress"
)

urlpatterns = router.urls
