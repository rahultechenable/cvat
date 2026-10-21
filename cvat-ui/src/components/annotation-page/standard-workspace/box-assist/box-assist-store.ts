// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { useSyncExternalStore } from 'react';
import { getCore } from 'cvat-core-wrapper';

// Box Assist state is shared by the sidebar control (settings) and the canvas overlay
// (suggestions), which live in different parts of the tree, so it is kept in a small store
// instead of the Redux state.

export interface BoxAssistModel {
    id: string;
    name: string;
    // where the file is on the server machine
    path: string;
    task: string;
    labels: string[];
    // only usable models can suggest boxes; the others are listed with the reason
    usable: boolean;
    reason: string;
}

export interface BoxAssistSettings {
    enabled: boolean;
    modelId: string | null;
    threshold: number;
    autoPredict: boolean;
}

export interface BoxAssistState extends BoxAssistSettings {
    models: BoxAssistModel[] | null;
    modelsFetching: boolean;
    // the server is still checking the model files it found
    modelsScanning: boolean;
    modelsError: string | null;
    // incremented to ask the overlay to (re)run the model on the current frame
    predictRequest: number;
}

const SETTINGS_KEY = 'cvat-box-assist-settings';
const DEFAULT_SETTINGS: BoxAssistSettings = {
    enabled: false,
    modelId: null,
    threshold: 0.5,
    autoPredict: true,
};

function loadSettings(): BoxAssistSettings {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        return { ...DEFAULT_SETTINGS, ...saved };
    } catch (_error: unknown) {
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettings(state: BoxAssistState): void {
    const {
        enabled, modelId, threshold, autoPredict,
    } = state;
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            enabled, modelId, threshold, autoPredict,
        }));
    } catch (_error: unknown) {
        // settings just won't be remembered
    }
}

let state: BoxAssistState = {
    ...loadSettings(),
    models: null,
    modelsFetching: false,
    modelsScanning: false,
    modelsError: null,
    predictRequest: 0,
};
const listeners = new Set<() => void>();

export function getBoxAssistState(): BoxAssistState {
    return state;
}

export function updateBoxAssistState(update: Partial<BoxAssistState>): void {
    state = { ...state, ...update };
    saveSettings(state);
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useBoxAssistState(): BoxAssistState {
    return useSyncExternalStore(subscribe, getBoxAssistState);
}

export function requestPrediction(): void {
    updateBoxAssistState({ predictRequest: state.predictRequest + 1 });
}

function errorToString(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

const SCAN_POLL_INTERVAL_MS = 3000;
let scanPollTimeout: ReturnType<typeof setTimeout> | null = null;

// refresh: ask the server to search the model directories again
export async function fetchBoxAssistModels(refresh = false): Promise<void> {
    if (state.modelsFetching) {
        return;
    }

    if (scanPollTimeout) {
        clearTimeout(scanPollTimeout);
        scanPollTimeout = null;
    }

    updateBoxAssistState({ modelsFetching: true, modelsError: null });
    try {
        const core = getCore();
        const url = `${core.config.backendAPI}/box_assist/models${refresh ? '?refresh=true' : ''}`;
        const response = await core.server.request(url, {
            method: 'GET',
        }) as { data: { scanning: boolean; models: BoxAssistModel[] } };
        const { models, scanning } = response.data;
        const usable = models.filter((model) => model.usable);
        const modelId = usable.some((model) => model.id === state.modelId) ?
            state.modelId : (usable[0]?.id ?? null);
        updateBoxAssistState({
            models, modelId, modelsFetching: false, modelsScanning: scanning,
        });

        if (scanning) {
            // the list fills up while the server checks the files
            scanPollTimeout = setTimeout(() => fetchBoxAssistModels(), SCAN_POLL_INTERVAL_MS);
        }
    } catch (error: unknown) {
        updateBoxAssistState({
            models: null, modelsFetching: false, modelsScanning: false, modelsError: errorToString(error),
        });
    }
}

export interface BoxAssistRawSuggestion {
    label_id: number;
    model_label: string;
    confidence: number;
    points: number[];
}

export interface BoxAssistSuggestResponse {
    model: string;
    frame: number;
    suggestions: BoxAssistRawSuggestion[];
    unmatched_labels: string[];
}

// The model is always asked for low-confidence boxes too,
// so moving the threshold slider filters them on the client without a new request
export const MIN_REQUEST_CONFIDENCE = 0.05;

export async function fetchSuggestions(
    jobID: number, frame: number, modelId: string,
): Promise<BoxAssistSuggestResponse> {
    const core = getCore();
    const response = await core.server.request(`${core.config.backendAPI}/box_assist/suggest`, {
        method: 'POST',
        data: {
            job: jobID,
            frame,
            model: modelId,
            conf: MIN_REQUEST_CONFIDENCE,
        },
    }) as { data: BoxAssistSuggestResponse };

    return response.data;
}
