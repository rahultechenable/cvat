# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from rest_framework import serializers


class BoxAssistModelSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    labels = serializers.ListField(child=serializers.CharField())


class BoxAssistSuggestRequestSerializer(serializers.Serializer):
    job = serializers.IntegerField()
    frame = serializers.IntegerField(min_value=0)
    model = serializers.CharField()
    conf = serializers.FloatField(min_value=0, max_value=1, default=0.05)


class BoxAssistSuggestionSerializer(serializers.Serializer):
    label_id = serializers.IntegerField()
    model_label = serializers.CharField()
    confidence = serializers.FloatField()
    points = serializers.ListField(
        child=serializers.FloatField(), min_length=4, max_length=4, help_text="[x1, y1, x2, y2]"
    )


class BoxAssistSuggestResponseSerializer(serializers.Serializer):
    model = serializers.CharField()
    frame = serializers.IntegerField()
    suggestions = BoxAssistSuggestionSerializer(many=True)
    unmatched_labels = serializers.ListField(
        child=serializers.CharField(),
        help_text="Model classes that have no matching box label in the job, so were skipped",
    )
