# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from rest_framework import routers

from .views import BoxAssistViewSet

router = routers.DefaultRouter(trailing_slash=False)
router.register("box_assist", BoxAssistViewSet, basename="box_assist")

urlpatterns = router.urls
