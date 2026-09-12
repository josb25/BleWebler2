import { PrintManager, type PrinterModelProfile, type PaperProfile } from 'universal-label-core';

export type ThemeOption = 'system' | 'light' | 'dark';
export type AnimationOption = 'normal' | 'fast' | 'none';
export type DefaultPrinterOption = string;

/**
 * Visual style, independent of light/dark. Two audiences want different things
 * from the same tool: `tech` is the compact indigo workshop UI, `craft` is a
 * warmer, softer, shop-front look. Both work in either colour scheme.
 */
export type SkinOption = 'tech' | 'craft';

export interface AppSettings {
    theme: ThemeOption;
    skin?: SkinOption;
    animations: AnimationOption;
    defaultPrinter: DefaultPrinterOption;
    customPapers: PaperProfile[];
    /** The media currently loaded in the printer (see {@link SettingsStore.paper}). */
    paper?: PaperProfile;
    /** Desktop editor chrome: sidebar widths (px) and collapsed state. */
    sidebars?: { leftW: number; rightW: number; leftOpen: boolean; rightOpen: boolean };
    /**
     * Whether the first-run walkthrough has been seen.
     *
     * Recorded once it has been dismissed *or* completed — skipping is a real
     * answer, and re-asking someone who already said "not now" every time they
     * open the app would be the worst version of this feature.
     */
    onboarded?: boolean;
    /**
     * Listing ids bookmarked in Discover.
     *
     * Kept here rather than in the library because a bookmark is explicitly
     * *not* ownership — it is "come back to this", for something you have not
     * taken yet and may never. Storing it as an empty library entry would put
     * things you do not have into the list of things you do.
     */
    bookmarks?: string[];
}

/** Sidebar sizing limits, shared by the store and the drag handles. */
export const SIDEBAR = { minW: 180, maxW: 520, leftDefault: 244, rightDefault: 336 };

export const PRINTER_PROFILES: PrinterModelProfile[] = new PrintManager().getAvailablePrinterProfiles();

export const DEFAULT_PRINTER_CAPS: Record<string, any> = {
    'none': { canvasHeightPx: 384, dpmm: 8, physical: { headToCutterPx: 100 } }
};

for (const profile of PRINTER_PROFILES) {
    DEFAULT_PRINTER_CAPS[profile.id] = profile.capabilities;
}

const STORAGE_KEY = 'blewebler2.settings.v1';

export class SettingsStore {
    theme = $state<ThemeOption>('system');
    animations = $state<AnimationOption>('normal');
    defaultPrinter = $state<DefaultPrinterOption>('marklife_p12');
    customPapers = $state<PaperProfile[]>([]);
    skin = $state<SkinOption>('tech');
    /** Editor sidebars — the user's own layout, so it persists across sessions. */
    leftW = $state<number>(SIDEBAR.leftDefault);
    rightW = $state<number>(SIDEBAR.rightDefault);
    leftOpen = $state<boolean>(true);
    rightOpen = $state<boolean>(true);
    /**
     * The media currently loaded in the printer. This is a property of the
     * *device*, not of any document — opening a different label or template must
     * not change which tape is in the machine — so it lives here and persists.
     */
    paper = $state<PaperProfile | undefined>(undefined);
    /** See {@link AppSettings.onboarded}. */
    onboarded = $state<boolean>(false);
    /** See {@link AppSettings.bookmarks}. */
    bookmarks = $state<string[]>([]);

    constructor() {
        this.load();
    }

    /** Show the walkthrough again from Settings. */
    replayOnboarding(): void {
        this.onboarded = false;
        this.save();
    }

    private load() {
        if (typeof localStorage === 'undefined') return;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            try {
                const parsed = JSON.parse(raw) as Partial<AppSettings>;
                if (['system', 'light', 'dark'].includes(parsed.theme as string)) {
                    this.theme = parsed.theme as ThemeOption;
                }
                if (['normal', 'fast', 'none'].includes(parsed.animations as string)) {
                    this.animations = parsed.animations as AnimationOption;
                }
                if (DEFAULT_PRINTER_CAPS[parsed.defaultPrinter as string]) {
                    this.defaultPrinter = parsed.defaultPrinter as string;
                }
                if (parsed.skin === 'tech' || parsed.skin === 'craft') {
                    this.skin = parsed.skin;
                }
                if (Array.isArray(parsed.customPapers)) {
                    this.customPapers = parsed.customPapers;
                }
                if (parsed.paper && typeof parsed.paper.tapeWidthMm === 'number') {
                    this.paper = parsed.paper;
                }
                // Settings that exist but predate this flag belong to someone
                // already using the app. Walking them through the basics
                // because a key is missing would be the update introducing
                // itself, which is not what a first-run tour is for. Only an
                // explicit `false` (Settings -> replay) reopens it.
                this.onboarded = parsed.onboarded !== false;
                if (Array.isArray(parsed.bookmarks)) {
                    this.bookmarks = parsed.bookmarks.filter((b): b is string => typeof b === 'string');
                }
                const sb = parsed.sidebars;
                if (sb && typeof sb === 'object') {
                    const clamp = (v: unknown, d: number) =>
                        typeof v === 'number' && Number.isFinite(v)
                            ? Math.min(SIDEBAR.maxW, Math.max(SIDEBAR.minW, v))
                            : d;
                    this.leftW = clamp(sb.leftW, SIDEBAR.leftDefault);
                    this.rightW = clamp(sb.rightW, SIDEBAR.rightDefault);
                    this.leftOpen = sb.leftOpen !== false;
                    this.rightOpen = sb.rightOpen !== false;
                }
            } catch (err) {
                if (import.meta.env.DEV) console.warn('Failed to parse settings:', err);
            }
        }
    }

    save() {
        if (typeof localStorage === 'undefined') return;
        const settings: AppSettings = {
            theme: this.theme,
            skin: this.skin,
            animations: this.animations,
            defaultPrinter: this.defaultPrinter,
            customPapers: this.customPapers,
            paper: this.paper,
            onboarded: this.onboarded,
            bookmarks: this.bookmarks,
            sidebars: {
                leftW: this.leftW, rightW: this.rightW,
                leftOpen: this.leftOpen, rightOpen: this.rightOpen
            }
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
}

export const globalSettings = new SettingsStore();
