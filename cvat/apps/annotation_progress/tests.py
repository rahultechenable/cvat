# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from django.test import SimpleTestCase

from .progress import compute_progress, get_track_frames


class TrackFramesTest(SimpleTestCase):
    def test_track_ends_on_outside_keyframe(self):
        self.assertEqual(get_track_frames([(2, False), (5, True)], stop_frame=10), {2, 3, 4})

    def test_open_track_lasts_until_job_end(self):
        self.assertEqual(get_track_frames([(7, False), (8, False)], stop_frame=9), {7, 8, 9})

    def test_track_reappears_after_outside(self):
        self.assertEqual(
            get_track_frames([(0, False), (2, True), (4, False), (6, True)], stop_frame=10),
            {0, 1, 4, 5},
        )

    def test_outside_only_track_is_never_visible(self):
        self.assertEqual(get_track_frames([(3, True), (5, True)], stop_frame=10), set())


class ComputeProgressTest(SimpleTestCase):
    def test_nothing_annotated(self):
        progress = compute_progress(list(range(10)), None, set())
        self.assertEqual((progress.total, progress.annotated, progress.remaining), (10, 0, 10))
        self.assertEqual(progress.resume_frame, 0)
        self.assertEqual(progress.with_annotations, 0)

    def test_skipped_frames_count_as_done(self):
        progress = compute_progress(list(range(10)), 6, {1, 6})
        self.assertEqual((progress.annotated, progress.remaining), (7, 3))
        self.assertEqual(progress.with_annotations, 2)
        self.assertEqual(progress.resume_frame, 7)

    def test_resume_skips_deleted_frames(self):
        # frames 4 and 5 are deleted
        progress = compute_progress([0, 1, 2, 3, 6, 7], 3, {3})
        self.assertEqual((progress.total, progress.annotated), (6, 4))
        self.assertEqual(progress.resume_frame, 6)

    def test_fully_annotated_job_resumes_on_last_frame(self):
        progress = compute_progress([10, 11, 12], 12, {10, 12})
        self.assertEqual(progress.remaining, 0)
        self.assertEqual(progress.resume_frame, 12)

    def test_job_with_offset(self):
        progress = compute_progress(list(range(100, 200)), 149, {149})
        self.assertEqual((progress.annotated, progress.remaining), (50, 50))
        self.assertEqual(progress.resume_frame, 150)

    def test_empty_job(self):
        progress = compute_progress([], None, set())
        self.assertEqual((progress.total, progress.remaining), (0, 0))
        self.assertIsNone(progress.resume_frame)
