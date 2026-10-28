# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""
Annotation progress is measured by position: the annotator works through the frames
in order and skips the frames that have nothing to annotate, so every frame up to the
last annotated one counts as done and annotation resumes on the next frame.
"""

import bisect
from collections.abc import Iterable
from dataclasses import dataclass
from itertools import groupby

from cvat.apps.engine.models import Job, LabeledImage, LabeledShape, TrackedShape


@dataclass(frozen=True)
class JobAnnotationProgress:
    total: int
    annotated: int
    with_annotations: int
    last_annotated_frame: int | None
    resume_frame: int | None

    @property
    def remaining(self) -> int:
        return self.total - self.annotated


def get_job_frames(job: Job) -> list[int]:
    "Task-relative numbers of the job frames, sorted, deleted frames excluded"
    segment = job.segment
    data = segment.task.data
    step = data.get_frame_step()
    deleted_frames = set(data.deleted_frames)

    # Segment.frame_set holds data (absolute) frame numbers, annotations use relative ones
    return sorted(
        rel_frame
        for rel_frame in ((frame - data.start_frame) // step for frame in segment.frame_set)
        if rel_frame not in deleted_frames
    )


def get_track_frames(keyframes: Iterable[tuple[int, bool]], stop_frame: int) -> set[int]:
    """
    Frames where a track is visible. keyframes are (frame, outside) pairs sorted by frame:
    the object is visible from a keyframe with outside=False until the next outside keyframe,
    or until the end of the job if there is none.
    """
    frames = set()
    visible_since = None
    for frame, outside in keyframes:
        if outside:
            if visible_since is not None:
                frames.update(range(visible_since, frame))
                visible_since = None
        elif visible_since is None:
            visible_since = frame

    if visible_since is not None:
        frames.update(range(visible_since, stop_frame + 1))

    return frames


def compute_progress(
    job_frames: list[int], last_annotated_frame: int | None, annotated_frames: set[int]
) -> JobAnnotationProgress:
    if last_annotated_frame is None:
        done = 0
    else:
        done = bisect.bisect_right(job_frames, last_annotated_frame)

    if not job_frames:
        resume_frame = None
    elif done < len(job_frames):
        resume_frame = job_frames[done]
    else:
        # everything is annotated, resume on the last frame for a final look
        resume_frame = job_frames[-1]

    return JobAnnotationProgress(
        total=len(job_frames),
        annotated=done,
        with_annotations=len(annotated_frames.intersection(job_frames)),
        last_annotated_frame=last_annotated_frame,
        resume_frame=resume_frame,
    )


def get_job_annotation_progress(job: Job) -> JobAnnotationProgress:
    job_frames = get_job_frames(job)
    if not job_frames:
        return compute_progress(job_frames, None, set())

    first_frame, last_frame = job_frames[0], job_frames[-1]

    frame_annotations = [
        LabeledShape.objects.filter(job=job, frame__gte=first_frame, frame__lte=last_frame),
        LabeledImage.objects.filter(job=job, frame__gte=first_frame, frame__lte=last_frame),
    ]
    annotated_frames = set()
    for queryset in frame_annotations:
        annotated_frames.update(queryset.values_list("frame", flat=True).distinct())

    keyframes = (
        TrackedShape.objects.filter(track__job=job, frame__gte=first_frame, frame__lte=last_frame)
        .order_by("track_id", "frame")
        .values_list("track_id", "frame", "outside")
    )

    # Where the annotator got to: the last shape, tag or track keyframe.
    # A track without an outside keyframe is visible up to the end of the job,
    # so the frames it covers say nothing about progress.
    last_annotated_frame = max(
        annotated_frames | {frame for _, frame, _ in keyframes}, default=None
    )

    for _, track_keyframes in groupby(keyframes, key=lambda row: row[0]):
        annotated_frames.update(
            get_track_frames(
                ((frame, outside) for _, frame, outside in track_keyframes), last_frame
            )
        )

    return compute_progress(job_frames, last_annotated_frame, annotated_frames)
