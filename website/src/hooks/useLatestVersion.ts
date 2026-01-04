import { useState, useEffect } from "react";

const GITHUB_REPO = "tiann/hapi";
const CACHE_KEY = "hapi-latest-version";
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

interface CachedVersion {
    version: string;
    timestamp: number;
}

export function useLatestVersion(fallback: string = "latest") {
    const [version, setVersion] = useState<string>(() => {
        // Try to get from cache first
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { version, timestamp }: CachedVersion = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_TTL) {
                    return version;
                }
            }
        } catch {
            // Ignore cache errors
        }
        return fallback;
    });

    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const res = await fetch(
                    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
                    { headers: { Accept: "application/vnd.github.v3+json" } }
                );
                if (!res.ok) return;

                const data = await res.json();
                const tag = data.tag_name as string;
                if (tag) {
                    setVersion(tag);
                    // Cache the result
                    localStorage.setItem(
                        CACHE_KEY,
                        JSON.stringify({ version: tag, timestamp: Date.now() })
                    );
                }
            } catch {
                // Keep fallback on error
            }
        };

        fetchVersion();
    }, []);

    return version;
}
