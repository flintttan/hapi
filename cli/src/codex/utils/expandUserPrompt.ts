export type CodexUserPromptExpansion = {
    expandedText: string;
    matchedCommand: string | null;
};

export function expandCodexUserPrompt(
    rawText: string,
    templatesByName: ReadonlyMap<string, string>
): CodexUserPromptExpansion {
    const trimmed = rawText.trim();
    if (!trimmed.startsWith('/')) {
        return { expandedText: rawText, matchedCommand: null };
    }

    const withoutPrefix = trimmed.replace(/^\/+/, '');
    if (!withoutPrefix) {
        return { expandedText: rawText, matchedCommand: null };
    }

    const firstWhitespace = withoutPrefix.search(/\s/);
    const name = (firstWhitespace === -1 ? withoutPrefix : withoutPrefix.slice(0, firstWhitespace)).trim();
    if (!name) {
        return { expandedText: rawText, matchedCommand: null };
    }

    const template = templatesByName.get(name);
    if (!template) {
        return { expandedText: rawText, matchedCommand: null };
    }

    const args = firstWhitespace === -1 ? '' : withoutPrefix.slice(firstWhitespace).trim();
    const suffix = args ? `\n\n${args}` : '';
    return { expandedText: `${template}${suffix}`.trimEnd(), matchedCommand: name };
}

