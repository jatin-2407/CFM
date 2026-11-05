interface ClassifyResult {
    matched: boolean;
    tier: 'exact' | 'range' | null;
    labels: string[];
    score: number;
    threshold: number;
    counts: { exact: number; range: number };
    matches: { score: number; labels: string[]; pattern: string[] }[];
    pattern: string[] | null;
    placeholders: { placeholder: string; value: string }[];
}

interface Window {
    downloadCFMRes: (id: string) => Promise<void>;
    openClassifier: (id: string, name?: string) => void;
}
