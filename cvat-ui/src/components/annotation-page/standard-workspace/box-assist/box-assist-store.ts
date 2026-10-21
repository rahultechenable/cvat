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
    labels: string[];
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

export async function fetchBoxAssistModels(): Promise<void> {
    if (state.modelsFetching) {
        return;
    }

    updateBoxAssistState({ modelsFetching: true, modelsError: null });
    try {
        const core = getCore();
        const response = await core.server.request(`${core.config.backendAPI}/box_assist/models`, {
            method: 'GET',
        }) as { data: BoxAssistModel[] };
        const models = response.data;
        const modelId = models.some((model) => model.id === state.modelId) ?
            state.modelId : (models[0]?.id ?? null);
        updateBoxAssistState({ models, modelId, modelsFetching: false });
    } catch (error: unknown) {
        updateBoxAssistState({ models: null, modelsFetching: false, modelsError: errorToString(error) });
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
