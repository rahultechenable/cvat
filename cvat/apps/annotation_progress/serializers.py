# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from rest_framework import serializers


class JobAnnotationProgressSerializer(serializers.Serializer):
    job = serializers.IntegerField()
    total = serializers.IntegerField(help_text="Frames in the job, deleted frames excluded")
    annotated = serializers.IntegerField(
        help_text="Frames up to and including the last annotated one, empty frames included"
    )
    remaining = serializers.IntegerField(help_text="Frames after the last annotated one")
    with_annotations = serializers.IntegerField(
        help_text="Frames that contain at least one shape, tag or visible track"
    )
    last_annotated_frame = serializers.IntegerField(allow_null=True)
    resume_frame = serializers.IntegerField(
        allow_null=True, help_text="The frame to continue annotating from"
    )
