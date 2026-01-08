/**
 * Terminal Font Provider
 *
 * Provides font configuration for terminal rendering with Nerd Font support.
 * Follows SOLID principles for easy extensibility.
 */

export interface ITerminalFontProvider {
    getFontFamily(): string
    initialize?(): Promise<void>
}

export class DefaultFontProvider implements ITerminalFontProvider {
    private static readonly NERD_FONTS = [
        'JetBrainsMono Nerd Font',
        'JetBrainsMonoNerdFont',
        'FiraCode Nerd Font',
        'FiraCodeNerdFont',
        'Hack Nerd Font',
        'HackNerdFont',
        'MapleMono NF',
        'Maple Mono NF',
        'Iosevka Nerd Font',
        'IosevkaNerdFont',
        'CaskaydiaCove Nerd Font',
        'MesloLGS Nerd Font',
        'SourceCodePro Nerd Font',
        'UbuntuMono Nerd Font'
    ]

    private static readonly SYSTEM_FALLBACKS = [
        'ui-monospace',
        'SFMono-Regular',
        'Menlo',
        'Monaco',
        'Consolas',
        '"Liberation Mono"',
        '"Courier New"',
        'monospace'
    ]

    getFontFamily(): string {
        return [...DefaultFontProvider.NERD_FONTS.map((font) => `"${font}"`), ...DefaultFontProvider.SYSTEM_FALLBACKS].join(
            ', '
        )
    }
}

export async function createFontProvider(mode: 'default' = 'default'): Promise<ITerminalFontProvider> {
    switch (mode) {
        case 'default':
        default:
            return new DefaultFontProvider()
    }
}
