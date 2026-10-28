// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from 'antd/lib/button';
import Progress from 'antd/lib/progress';
import Text from 'antd/lib/typography/Text';
import { CaretRightOutlined } from '@ant-design/icons';
import { getCore, Job } from 'cvat-core-wrapper';
import CVATTooltip from 'components/common/cvat-tooltip';
import { useIsMounted } from 'utils/hooks';

export interface JobAnnotationProgress {
    job: number;
    total: number;
    annotated: number;
    remaining: number;
    with_annotations: number;
    last_annotated_frame: number | null;
    resume_frame: number | null;
}

// Progress is measured by position: frames up to the last annotated one count as done,
// including the empty frames the annotator skipped (see cvat/apps/annotation_progress)
export function useJobAnnotationProgress(job: Job): JobAnnotationProgress | null {
    const [progress, setProgress] = useState<JobAnnotationProgress | null>(null);
    const isMounted = useIsMounted();

    useEffect(() => {
        const core = getCore();
        core.server.request(`${core.config.backendAPI}/annotation_progress/jobs/${job.id}`, {
            method: 'GET',
        }).then((response: { data: JobAnnotationProgress }) => {
            if (isMounted()) {
                setProgress(response.data);
            }
        }).catch((error: unknown) => {
            // the card is still usable without progress, so the error is not shown
            console.warn(`Could not get the annotation progress of job ${job.id}`, error);
        });
    }, [job.id, job.updatedDate]);

    return progress;
}

export function JobResumeButton(
    { job, progress }: Readonly<{ job: Job; progress: JobAnnotationProgress | null }>,
): JSX.Element | null {
    // nothing annotated yet: Annotate opens the first frame anyway; everything annotated: nothing to resume
    if (!progress || progress.resume_frame === null || progress.annotated === 0 || progress.remaining === 0) {
        return null;
    }

    return (
        <CVATTooltip title={`Continue from frame ${progress.resume_frame}`}>
            <Link to={`/tasks/${job.taskId}/jobs/${job.id}?frame=${progress.resume_frame}`}>
                <Button size='small' icon={<CaretRightOutlined />} className='cvat-job-item-resume-button'>
                    {`Resume @ ${progress.resume_frame}`}
                </Button>
            </Link>
        </CVATTooltip>
    );
}

export function JobProgressBar(
    { progress }: Readonly<{ progress: JobAnnotationProgress | null }>,
): JSX.Element | null {
    if (!progress || !progress.total) {
        return null;
    }

    const percent = Math.floor((progress.annotated / progress.total) * 100);
    const done = progress.remaining === 0;
    const tooltip = (
        <>
            <div>{`Annotated up to frame ${progress.last_annotated_frame ?? '-'}`}</div>
            <div>{`Frames that contain annotations: ${progress.with_annotations.toLocaleString()}`}</div>
            <div>Empty frames before the last annotated one count as done</div>
        </>
    );

    return (
        <CVATTooltip title={tooltip}>
            <div className='cvat-job-item-progress'>
                <Progress
                    percent={percent}
                    showInfo={false}
                    size='small'
                    status={done ? 'success' : 'normal'}
                />
                <Text type='secondary' className='cvat-job-item-progress-text'>
                    {done ?
                        `All ${progress.total.toLocaleString()} frames annotated` :
                        `${progress.annotated.toLocaleString()} annotated · ` +
                        `${progress.remaining.toLocaleString()} remaining (${percent}%)`}
                </Text>
            </div>
        </CVATTooltip>
    );
}
