import type { ColorValue } from './components/ui/types';
export declare const TILE_SIZE = 16;
export declare const DEFAULT_COLS = 20;
export declare const DEFAULT_ROWS = 11;
export declare const MAX_COLS = 64;
export declare const MAX_ROWS = 64;
export declare const WALK_SPEED_PX_PER_SEC = 48;
export declare const WALK_FRAME_DURATION_SEC = 0.15;
export declare const TYPE_FRAME_DURATION_SEC = 0.3;
export declare const WANDER_PAUSE_MIN_SEC = 2;
export declare const WANDER_PAUSE_MAX_SEC = 20;
export declare const WANDER_MOVES_BEFORE_REST_MIN = 3;
export declare const WANDER_MOVES_BEFORE_REST_MAX = 6;
export declare const SEAT_REST_MIN_SEC = 120;
export declare const SEAT_REST_MAX_SEC = 240;
export declare const MATRIX_EFFECT_DURATION_SEC = 0.3;
export declare const MATRIX_TRAIL_LENGTH = 6;
export declare const MATRIX_SPRITE_COLS = 16;
export declare const MATRIX_SPRITE_ROWS = 24;
export declare const MATRIX_FLICKER_FPS = 30;
export declare const MATRIX_FLICKER_VISIBILITY_THRESHOLD = 180;
export declare const MATRIX_COLUMN_STAGGER_RANGE = 0.3;
export declare const MATRIX_HEAD_COLOR = "#ccffcc";
export declare const matrixGreenBright: (a: number) => string;
export declare const matrixGreenMid: (a: number) => string;
export declare const matrixGreenDim: (a: number) => string;
export declare const MATRIX_TRAIL_OVERLAY_ALPHA = 0.6;
export declare const MATRIX_TRAIL_EMPTY_ALPHA = 0.5;
export declare const MATRIX_TRAIL_MID_THRESHOLD = 0.33;
export declare const MATRIX_TRAIL_DIM_THRESHOLD = 0.66;
export declare const CHARACTER_SITTING_OFFSET_PX = 6;
export declare const CHARACTER_Z_SORT_OFFSET = 0.5;
export declare const OUTLINE_Z_SORT_OFFSET = 0.001;
export declare const SELECTED_OUTLINE_ALPHA = 1;
export declare const HOVERED_OUTLINE_ALPHA = 0.5;
/** Headless agents (adopted, no terminal to focus) render slightly translucent. */
export declare const HEADLESS_CHARACTER_ALPHA = 0.5;
export declare const GHOST_PREVIEW_SPRITE_ALPHA = 0.5;
export declare const GHOST_PREVIEW_TINT_ALPHA = 0.25;
export declare const SELECTION_DASH_PATTERN: [number, number];
export declare const BUTTON_MIN_RADIUS = 6;
export declare const BUTTON_RADIUS_ZOOM_FACTOR = 3;
export declare const BUTTON_ICON_SIZE_FACTOR = 0.45;
export declare const BUTTON_LINE_WIDTH_MIN = 1.5;
export declare const BUTTON_LINE_WIDTH_ZOOM_FACTOR = 0.5;
export declare const BUBBLE_FADE_DURATION_SEC = 0.5;
export declare const BUBBLE_SITTING_OFFSET_PX = 10;
export declare const BUBBLE_VERTICAL_OFFSET_PX = 24;
export declare const FALLBACK_FLOOR_COLOR = "#808080";
export declare const SEAT_OWN_COLOR = "rgba(0, 127, 212, 0.35)";
export declare const SEAT_AVAILABLE_COLOR = "rgba(0, 200, 80, 0.35)";
export declare const SEAT_BUSY_COLOR = "rgba(220, 50, 50, 0.35)";
export declare const GRID_LINE_COLOR = "rgba(255,255,255,0.12)";
export declare const VOID_TILE_OUTLINE_COLOR = "rgba(255,255,255,0.08)";
export declare const VOID_TILE_DASH_PATTERN: [number, number];
export declare const GHOST_BORDER_HOVER_FILL = "rgba(60, 130, 220, 0.25)";
export declare const GHOST_BORDER_HOVER_STROKE = "rgba(60, 130, 220, 0.5)";
export declare const GHOST_BORDER_STROKE = "rgba(255, 255, 255, 0.06)";
export declare const GHOST_VALID_TINT = "#00ff00";
export declare const GHOST_INVALID_TINT = "#ff0000";
export declare const SELECTION_HIGHLIGHT_COLOR = "#007fd4";
export declare const DELETE_BUTTON_BG = "rgba(200, 50, 50, 0.85)";
export declare const ROTATE_BUTTON_BG = "rgba(50, 120, 200, 0.85)";
export declare const BUTTON_ICON_COLOR = "#fff";
export declare const CANVAS_FALLBACK_TILE_COLOR = "#444";
export declare const CANVAS_ERROR_TILE_COLOR = "#FF00FF";
export declare const WALL_COLOR = "#3A3A5C";
export declare const CAMERA_FOLLOW_LERP = 0.1;
export declare const CAMERA_FOLLOW_SNAP_THRESHOLD = 0.5;
export declare const ZOOM_MIN = 1;
export declare const ZOOM_MAX = 10;
export declare const ZOOM_DEFAULT_DPR_FACTOR = 2;
export declare const ZOOM_LEVEL_FADE_DELAY_MS = 1500;
export declare const ZOOM_LEVEL_HIDE_DELAY_MS = 2000;
export declare const ZOOM_LEVEL_FADE_DURATION_SEC = 0.5;
export declare const ZOOM_SCROLL_THRESHOLD = 50;
export declare const PAN_MARGIN_FRACTION = 0.25;
export declare const UNDO_STACK_MAX_SIZE = 50;
export declare const LAYOUT_SAVE_DEBOUNCE_MS = 500;
/** data-testid of the office canvas — e2e drives real editor gestures on it. */
export declare const OFFICE_CANVAS_TEST_ID = "office-canvas";
/** Ghost-border hover tile when the border isn't shown — off any reachable tile. */
export declare const GHOST_BORDER_NO_HOVER_TILE = -999;
/** Suggested filename when exporting the office layout from the standalone browser. */
export declare const LAYOUT_EXPORT_FILENAME = "pixel-agents-layout.json";
/** MIME type for the exported layout Blob. */
export declare const LAYOUT_EXPORT_MIME = "application/json";
export declare const DEFAULT_FLOOR_COLOR: ColorValue;
export declare const DEFAULT_WALL_COLOR: ColorValue;
export declare const DEFAULT_NEUTRAL_COLOR: ColorValue;
/** Main (lowest-luminance) color applied to carpets when no per-tile override is set. */
export declare const CARPET_DEFAULT_COLOR: ColorValue;
/** Accent (highest-luminance) color applied to carpets when no per-tile override is set. */
export declare const CARPET_DEFAULT_ACCENT_COLOR: ColorValue;
/** Keyboard key that switches from CARPET_PAINT to CARPET_PICK while editing. */
export declare const KEY_CARPET_PICK = "p";
/** Color palette assigned to new Areas in rotation (cycles when more areas exist). */
export declare const AREA_DEFAULT_COLORS: readonly string[];
/** Translucent overlay alpha for area tile fills. */
export declare const AREA_OVERLAY_ALPHA = 0.25;
/** Alpha multiplier applied to the actively-selected area's overlay. */
export declare const AREA_ACTIVE_ALPHA_MULTIPLIER = 1.6;
/** Base font size (pixel-pre-zoom) for area centroid labels. */
export declare const AREA_LABEL_FONT_SIZE_PX = 14;
/** Minimum on-screen label size to keep labels legible at low zoom. */
export declare const AREA_LABEL_MIN_FONT_SIZE_PX = 12;
/** Alpha of the area label text. */
export declare const AREA_LABEL_ALPHA = 1;
/** Fallback label color when an area has no color set (shouldn't happen in practice). */
export declare const AREA_LABEL_FALLBACK_COLOR = "#ffffff";
/** Drop-shadow color behind area labels for legibility on light backgrounds. */
export declare const AREA_LABEL_SHADOW_COLOR = "#000000";
/** Drop-shadow alpha behind area labels. */
export declare const AREA_LABEL_SHADOW_ALPHA = 0.6;
export declare const VISUAL_COLOR_PICKER_SV_SIZE_PX = 180;
export declare const VISUAL_COLOR_PICKER_HUE_WIDTH_PX = 20;
export declare const VISUAL_COLOR_PICKER_MARKER_RADIUS_PX = 6;
/**
 * The hue bar gradient is intrinsic to the color-picking interaction, not a
 * theme color — it must span the full hue circle. Centralized here so the
 * component body stays free of inline color literals. (The saturation/brightness
 * square is painted to a canvas from the carpet HSL model, not a CSS gradient.)
 */
export declare const VISUAL_COLOR_PICKER_HUE_GRADIENT: string;
export declare const VISUAL_COLOR_PICKER_MARKER_BORDER = "2px solid #fff";
export declare const VISUAL_COLOR_PICKER_MARKER_SHADOW = "0 0 0 1px rgba(0,0,0,0.6)";
/** Width of the collapsed swatch + hex trigger row (compact mode). */
export declare const VISUAL_COLOR_PICKER_COMPACT_WIDTH_PX = 160;
/** Swatch square size shown in the collapsed trigger. */
export declare const VISUAL_COLOR_PICKER_SWATCH_PX = 22;
/** Gap (px) between the collapsed trigger and the expanded popup panel. */
export declare const VISUAL_COLOR_PICKER_POPUP_GAP_PX = 6;
export declare const NOTIFICATION_NOTE_1_HZ = 659.25;
export declare const NOTIFICATION_NOTE_2_HZ = 1318.51;
export declare const NOTIFICATION_NOTE_1_START_SEC = 0;
export declare const NOTIFICATION_NOTE_2_START_SEC = 0.1;
export declare const NOTIFICATION_NOTE_DURATION_SEC = 0.18;
export declare const NOTIFICATION_VOLUME = 0.14;
export declare const PERMISSION_NOTE_1_HZ = 880;
export declare const PERMISSION_NOTE_2_HZ = 659.25;
export declare const PERMISSION_NOTE_1_START_SEC = 0;
export declare const PERMISSION_NOTE_2_START_SEC = 0.12;
export declare const PERMISSION_NOTE_DURATION_SEC = 0.15;
export declare const PERMISSION_VOLUME = 0.12;
export declare const FURNITURE_ANIM_INTERVAL_SEC = 0.2;
export declare const WHATS_NEW_AUTO_CLOSE_MS = 20000;
export declare const WHATS_NEW_FADE_MS = 1000;
export declare const MAX_DELTA_TIME_SEC = 0.1;
export declare const WAITING_BUBBLE_DURATION_SEC = 2;
export declare const DISMISS_BUBBLE_FAST_FADE_SEC = 0.3;
export declare const INACTIVE_SEAT_TIMER_MIN_SEC = 3;
export declare const INACTIVE_SEAT_TIMER_RANGE_SEC = 2;
/** Default/fallback palette count (bundled characters). Actual count comes from getLoadedCharacterCount(). */
export declare const PALETTE_COUNT = 6;
export declare const AUTO_ON_FACING_DEPTH = 3;
export declare const AUTO_ON_SIDE_DEPTH = 2;
export declare const CHARACTER_HIT_HALF_WIDTH = 8;
export declare const CHARACTER_HIT_HEIGHT = 24;
export declare const TOOL_OVERLAY_VERTICAL_OFFSET = 32;
/** Reserved character id for the Intro's greeter. Far outside both real agent
 *  ids (positive) and sub-agent ids (small negatives from -1 down). */
export declare const GREETER_ID = -1000000000;
/** Stacking order for the Intro's bubble. Deliberately BELOW the modal stack
 *  (ui/Modal defaults to 50, ChangelogModal 51, the migration notice z-100): the
 *  Intro is diegetic furniture over the office, not a modal, so a modal opened
 *  on top of it must cover it rather than slide underneath. */
export declare const INTRO_BUBBLE_Z_INDEX = 45;
/** ToolOverlay stacking: status label panels (selected one on top), then the
 *  characters' speech bubbles above every label — all below the Intro bubble. */
export declare const OVERLAY_LABEL_Z_INDEX = 41;
export declare const OVERLAY_LABEL_SELECTED_Z_INDEX = 42;
export declare const OVERLAY_BUBBLE_Z_INDEX = 43;
/** The greeter stands this many tiles in from the office's bottom-left corner
 *  (target tile (margin, rows-1-margin); nearest walkable tile if blocked). */
export declare const GREETER_TILE_MARGIN = 3;
/** World px above the greeter's anchor (feet) where the bubble's bottom sits.
 *  Kept well above the head target (INTRO_TAIL_TARGET_RISE_WORLD) so the
 *  tail squares have a visible run between bubble and head. */
export declare const INTRO_BUBBLE_ANCHOR_RISE_WORLD = 44;
/** World px right of the greeter's center where the bubble's left edge starts —
 *  just clear of the sprite so the tail points down-left at the head. */
export declare const INTRO_BUBBLE_OFFSET_X_WORLD = 10;
/** Bubble width cap (CSS px) and the margin kept from the container edges.
 *  Wide on purpose: the disclosure reads as three short paragraphs instead of
 *  a tall column (still clamped to the container on narrow panels). */
export declare const INTRO_BUBBLE_MAX_WIDTH_PX = 560;
export declare const INTRO_BUBBLE_EDGE_MARGIN_PX = 4;
/** Where the Intro's Claude Code step sends people who don't have it yet. */
export declare const CLAUDE_CODE_URL = "https://claude.com/claude-code";
export declare const CLAUDE_CODE_INSTALL_COMMAND = "npm install -g @anthropic-ai/claude-code";
/** Speech-tail squares: placed at fraction `t` along the segment from the
 *  bubble's nearest edge point to the greeter's head, shrinking toward the
 *  speaker. Recomputed every frame so the tail stays connected no matter where
 *  edge-clamping or panning puts the bubble relative to the character. */
export declare const INTRO_TAIL_STEPS: readonly [{
    readonly t: 0.25;
    readonly size: 12;
}, {
    readonly t: 0.55;
    readonly size: 9;
}, {
    readonly t: 0.82;
    readonly size: 6;
}];
/** World px above the greeter's anchor (feet) the tail points at — the head. */
export declare const INTRO_TAIL_TARGET_RISE_WORLD = 26;
/** Camera-offset caps while centering character + bubble. The ideal composition
 *  assumes the bubble fits beside/above the character; when it can't (narrow or
 *  short viewports clamp the bubble to the screen), uncapped offsets shove the
 *  greeter to the viewport edge. Horizontal offset is capped to this fraction
 *  of the viewport; vertical offset always keeps this many world px of the
 *  character visible above the bottom edge. */
export declare const INTRO_CAMERA_MAX_X_OFFSET_VIEWPORT_FRACTION = 0.25;
export declare const INTRO_CAMERA_MIN_CHAR_VISIBLE_WORLD = 48;
/** Extra downward camera shift (CSS px) so the character+bubble composition
 *  sits a bit above the vertical center instead of dead-centered. */
export declare const INTRO_CAMERA_DOWN_SHIFT_PX = 50;
/** Window assumed before the runtime reports one (it always does for agents
 *  that have taken a turn; this only covers characters created ahead of it). */
export declare const DEFAULT_MAX_CONTEXT_TOKENS = 200000;
export declare const CONTEXT_WARN_THRESHOLD = 0.6;
export declare const CONTEXT_DANGER_THRESHOLD = 0.8;
export declare const CONTEXT_CRITICAL_THRESHOLD = 0.95;
export declare const CONTEXT_GAUGE_WIDTH_PX = 40;
export declare const CONTEXT_GAUGE_HEIGHT_PX = 4;
export declare const CONTEXT_GAUGE_COLOR_OK = "#44cc44";
export declare const CONTEXT_GAUGE_COLOR_WARN = "#ffcc00";
export declare const CONTEXT_GAUGE_COLOR_DANGER = "#ff8800";
export declare const CONTEXT_GAUGE_COLOR_CRITICAL = "#ff2222";
export declare const CONTEXT_GAUGE_BG = "#222";
export declare const TEAM_LEAD_COLOR = "#ffd700";
export declare const TEAM_ROLE_COLOR = "#66aaff";
/** Walking speed in world pixels per second (matches character walk speed visually but slower). */
export declare const PET_WALK_SPEED_PX_PER_SEC = 32;
/** Time per WALK animation cycle step (4 cycle steps × 0.15s = 0.6s per loop). */
export declare const PET_WALK_FRAME_DURATION_SEC = 0.15;
/** Time per IDLE animation cycle step (4 cycle steps × 0.3s = 1.2s per loop). */
export declare const PET_IDLE_FRAME_DURATION_SEC = 0.3;
/** Walk cycle: 4-step lookup into the 3-frame walkDown/walkUp/walkRight arrays. */
export declare const PET_WALK_SEQUENCE: readonly [0, 1, 0, 2];
/** Idle cycle: 4-step lookup into the 3-frame idleDown/idleUp arrays. */
export declare const PET_IDLE_SEQUENCE: readonly [0, 1, 2, 1];
/** Minimum seconds the pet stays in IDLE before making a new decision. */
export declare const PET_WANDER_PAUSE_MIN_SEC = 3;
/** Maximum seconds the pet stays in IDLE before making a new decision. */
export declare const PET_WANDER_PAUSE_MAX_SEC = 15;
/** Seconds between FOLLOW path re-computations. */
export declare const PET_FOLLOW_RECALC_INTERVAL_SEC = 1;
/** Probability that a pet enters FOLLOW (instead of WALK) when wanderTimer expires. */
export declare const PET_FOLLOW_CHANCE = 0.3;
/** Maximum Manhattan distance (tiles) at which a character can become a follow target. */
export declare const PET_FOLLOW_RADIUS_TILES = 3;
/** Minimum seconds a FOLLOW episode lasts before timing out. */
export declare const PET_FOLLOW_DURATION_MIN_SEC = 5;
/** Maximum seconds a FOLLOW episode lasts before timing out. */
export declare const PET_FOLLOW_DURATION_MAX_SEC = 15;
/** Hit-box half-width (world px) for pet click detection. */
export declare const PET_HIT_HALF_WIDTH = 8;
/** Hit-box height (world px) measured upward from the bottom-center anchor. */
export declare const PET_HIT_HEIGHT = 16;
/** Zoom factor used to draw pet thumbnails in the EditorToolbar Pets tab. */
export declare const PET_THUMB_ZOOM = 2;
/** Scale margin so the pet thumbnail fills the ItemSelect cell without touching the edges. */
export declare const PET_THUMB_SCALE_MARGIN = 0.85;
/** Fallback background fill for sprite-less thumbnail (used while pet sprites are loading). */
export declare const EMPTY_SPRITE_THUMBNAIL_BG = "#333";
/** Maximum string length for a PlacedPet.id (defends against pathologically-long layout entries). */
export declare const MAX_PET_ID_LENGTH = 128;
/** Reconnect backoff ladder shared by the /ws transport and every terminal
 *  socket (transport/reconnectBackoff.ts). The last rung repeats. */
export declare const WS_RECONNECT_DELAYS_MS: readonly [250, 500, 1000, 2000, 4000];
/** Open width the panel starts at, in px; the user can drag to resize. */
export declare const TERMINAL_DRAWER_DEFAULT_WIDTH_PX = 520;
/** Clamp for the drag: never narrower than this. */
export declare const TERMINAL_DRAWER_MIN_WIDTH_PX = 320;
/** Clamp for the drag: never wider than this fraction of the window. */
export declare const TERMINAL_DRAWER_MAX_WIDTH_RATIO = 0.8;
/** Width of the always-visible agent-card bar overlaying the office's right
 *  edge — fits the toggle handle and the stacked agent cards (40px mug shot +
 *  16px close/status column + card chrome ≈ 63px, plus a little air each
 *  side). */
export declare const TERMINAL_SIDEBAR_WIDTH_PX = 72;
/** Grab width of the drag handle on the panel's left edge. */
export declare const TERMINAL_DRAWER_RESIZE_HANDLE_PX = 6;
export declare const MUGSHOT_CROP_TOP_ROW = 0;
export declare const MUGSHOT_CROP_LEFT_COL = -1;
export declare const MUGSHOT_CROP_SIDE_PX = 20;
/** Integer sprite-pixel zoom. 2 = each sprite pixel is 2 px. */
export declare const MUGSHOT_RENDER_ZOOM = 2;
/** On-screen size in CSS px. Equal to the backing canvas (crop × zoom) so there
 *  is no fractional scaling — the mug shot stays pixel-perfect. */
export declare const MUGSHOT_DISPLAY_PX: number;
/** Terminal CONTENT is monospace on purpose: FS Pixel Sans is not a mono font,
 *  and a TUI mis-renders in a proportional face. The drawer chrome around it
 *  still uses the pixel font. */
export declare const TERMINAL_FONT_FAMILY = "ui-monospace, SFMono-Regular, Menlo, Consolas, \"DejaVu Sans Mono\", monospace";
export declare const TERMINAL_FONT_SIZE_PX = 13;
/** Lines xterm retains client-side (independent of the server's replay ring). */
export declare const TERMINAL_SCROLLBACK_LINES = 5000;
/** Debounce for propagating a resize to the PTY (fit on every frame thrashes it). */
export declare const TERMINAL_RESIZE_DEBOUNCE_MS = 100;
/** URL schemes a click in the terminal pane may open (see terminalLinks.ts). */
export declare const TERMINAL_LINK_PROTOCOLS: readonly string[];
/** window.open features for terminal links: no opener handle, no Referer. */
export declare const TERMINAL_LINK_WINDOW_FEATURES = "noopener,noreferrer";
/** THE plain-URL pattern of the terminal pane: TerminalPane hands it to
 *  @xterm/addon-web-links (`urlRegex`) for mouse clicks and urlAtCell matches
 *  it for touch taps, so a URL that is clickable is exactly one that is
 *  tappable. Equivalent to the addon's built-in strictUrlRegex. Deliberately
 *  NOT global: the addon rebuilds it as `new RegExp(source, flags + 'g')`, so
 *  a `g` here would throw on the duplicate flag; matchAll callers make their
 *  own global copy. */
export declare const TERMINAL_URL_PATTERN: RegExp;
/** Largest OSC 52 clipboard write the terminal honours (clipboardKeys.ts),
 *  in base64 characters (~3 MB of text). Bigger ones are dropped rather than
 *  decoded: a runaway program shouldn't be able to stall the page. */
export declare const TERMINAL_OSC52_MAX_BASE64_CHARS = 4000000;
/** xterm theme, matched to the office palette (index.css :root). */
export declare const TERMINAL_THEME: {
    readonly background: "#181828";
    readonly foreground: "rgba(255, 255, 255, 0.9)";
    readonly cursor: "#6030ff";
    readonly cursorAccent: "#181828";
    readonly selectionBackground: "rgba(96, 48, 255, 0.4)";
    readonly black: "#1e1e2e";
    readonly red: "#d14249";
    readonly green: "#89d185";
    readonly yellow: "#cca700";
    readonly blue: "#3794ff";
    readonly magenta: "#746fff";
    readonly cyan: "#4ad9d9";
    readonly white: "rgba(255, 255, 255, 0.9)";
    readonly brightBlack: "#4a4a6a";
    readonly brightRed: "#ff6b72";
    readonly brightGreen: "#a8e5a4";
    readonly brightYellow: "#ffd700";
    readonly brightBlue: "#66aaff";
    readonly brightMagenta: "#a29bff";
    readonly brightCyan: "#7fe8e8";
    readonly brightWhite: "#ffffff";
};
export declare const MOBILE_MEDIA_QUERY = "(max-width: 768px), ((pointer: coarse) and (max-width: 1024px))";
/** Slide duration between the office and terminal pages. */
export declare const MOBILE_VIEW_TRANSITION_MS = 300;
/** Width of the screen-edge strips that arm the view-switch swipe: right
 *  edge in office view (swipe left → terminal), left edge in terminal view
 *  (swipe right → office). */
export declare const MOBILE_EDGE_SWIPE_ZONE_PX = 24;
/** Horizontal movement that claims an armed edge touch as a view swipe; it
 *  must also dominate the vertical axis, or the touch is handed back. */
export declare const MOBILE_EDGE_SWIPE_SLOP_PX = 8;
/** Fraction of the page width past which a released swipe commits. */
export declare const MOBILE_EDGE_SWIPE_COMMIT_RATIO = 0.35;
/** Release velocity (px/ms) that commits a swipe regardless of distance. */
export declare const MOBILE_EDGE_SWIPE_COMMIT_VELOCITY = 0.3;
/** Weight of the newest sample in the swipe's smoothed release velocity
 *  (the rest carries over from the previous estimate). */
export declare const MOBILE_EDGE_SWIPE_VELOCITY_WEIGHT = 0.8;
/** Slightly smaller than the desktop 13px: a 390px phone fits ~46 columns at
 *  13px but ~50 at 12px, and Claude Code's TUI degrades below ~45 columns. */
export declare const MOBILE_TERMINAL_FONT_SIZE_PX = 12;
/** Tap slop shared by every touch surface (withinTapSlop): a finger that
 *  travels less than this from where it landed is still a tap; beyond it the
 *  gesture becomes that surface's drag (pan, scroll, reorder). */
export declare const TOUCH_TAP_MAX_MOVE_PX = 10;
/** A press longer than this is not a tap even if the finger never moved. */
export declare const TOUCH_TAP_MAX_DURATION_MS = 350;
/** Hold a finger within the tap slop for this long on the terminal to start
 *  text selection instead of scrolling: the word under the finger is
 *  selected, and dragging then extends the selection cell by cell. */
export declare const TERMINAL_LONG_PRESS_MS = 500;
/** Vertical gap between the selection's top row and the floating copy pill
 *  hovering above it (clears the start handle's knob). */
export declare const TERMINAL_COPY_PILL_GAP_PX = 56;
/** The copy pill's center stays at least this far from the pane's left and
 *  right edges — or half its measured width, when that is more — so it is
 *  never clipped. */
export declare const TERMINAL_COPY_PILL_EDGE_INSET_X_PX = 44;
/** The copy pill's top stays at least this far above the pane's bottom edge
 *  (its own height plus a margin). */
export declare const TERMINAL_COPY_PILL_BOTTOM_CLEARANCE_PX = 48;
/** The copy pill's top never goes above this; a pill that would (selection
 *  near the top of the pane) drops below the selection instead. */
export declare const TERMINAL_COPY_PILL_MIN_TOP_PX = 4;
/** Gap below the selection's last row when the pill drops beneath it (clears
 *  the end handle's knob). */
export declare const TERMINAL_COPY_PILL_BELOW_OFFSET_PX = 16;
/** Width of a selection handle's touch strip, centered on the selection edge.
 *  Feeds the `.terminal-sel-handle` CSS through --sel-handle-w. */
export declare const TERMINAL_SEL_HANDLE_WIDTH_PX = 24;
/** Side of a selection handle's square knob (above the start bar, below the
 *  end bar). Feeds the `.terminal-sel-handle` CSS through --sel-knob. */
export declare const TERMINAL_SEL_HANDLE_KNOB_PX = 12;
/** Copy-flowing (flowCopy.ts) judges "the next word would not have fit on
 *  the row above" against `cols` minus this: Claude Code wraps prose a few
 *  columns short of the terminal width (its own gutters). Too small and real
 *  soft wraps stay broken; too large and short deliberate lines get joined. */
export declare const TERMINAL_COPY_WRAP_SLACK_COLS = 4;
/** Flick decay after a terminal touch-scroll release, applied per millisecond
 *  of frame time (0.998 ≈ iOS UIScrollView's normal deceleration rate). */
export declare const TERMINAL_FLICK_DECAY_PER_MS = 0.998;
/** Release velocity (px/ms) below which no flick starts and at which a
 *  running flick stops. */
export declare const TERMINAL_FLICK_MIN_VELOCITY_PX_PER_MS = 0.05;
/** Exponential smoothing of the touch-scroll velocity: weight of the newest
 *  move's sample (the running value keeps the rest). The release velocity
 *  comes from the last move event, which is noisy on its own. */
export declare const TERMINAL_FLICK_VELOCITY_SMOOTHING = 0.8;
/** xterm's cell-grid element: hit-testing, row height and the selection
 *  chrome all measure THIS rect (not the host, which keeps up to a row of
 *  slack below the grid after fit). */
export declare const XTERM_SCREEN_SELECTOR = ".xterm-screen";
/** Class of xterm's hidden input textarea — focused while typing into a
 *  terminal (see isTypingInTerminal). */
export declare const XTERM_HELPER_TEXTAREA_CLASS = "xterm-helper-textarea";
/** Holding a card motionless this long arms drag-to-reorder in the mobile bar. */
export declare const CARD_REORDER_LONG_PRESS_MS = 400;
/** Holding a drawer's Directory row this long opens its edit modal — the touch
 *  stand-in for the pencil, which only exists where rows can be hovered. */
export declare const DRAWER_EDIT_LONG_PRESS_MS = 500;
/** Finger slop for that hold: moving beyond this is a scroll, not a press. */
export declare const DRAWER_EDIT_LONG_PRESS_MAX_MOVE_PX = 10;
/** Gap a viewport-fitted Dropdown (the launch drawer) keeps from the top of
 *  the viewport when its content is taller than the room above its anchor. */
export declare const DROPDOWN_VIEWPORT_MARGIN_PX = 8;
/** localStorage key for the mobile bar's custom card order (per device — a
 *  presentation preference, deliberately not synced through the server). */
export declare const MOBILE_CARD_ORDER_STORAGE_KEY = "pixel-agents.mobileCardOrder";
/** Breathing room kept between a card and the scroller edge when the bar
 *  auto-scrolls the focused agent's card into view. */
export declare const CARD_SCROLL_INTO_VIEW_MARGIN_PX = 8;
/** Arrow-key byte sequences the trackpad key writes to the PTY. */
export declare const TERMINAL_SEQ_ARROW_UP = "\u001B[A";
export declare const TERMINAL_SEQ_ARROW_DOWN = "\u001B[B";
export declare const TERMINAL_SEQ_ARROW_RIGHT = "\u001B[C";
export declare const TERMINAL_SEQ_ARROW_LEFT = "\u001B[D";
/** Accessory keys shown above the iOS keyboard in terminal view — the keys a
 *  Claude Code TUI needs that the software keyboard lacks. `sequence` is the
 *  raw bytes written to the PTY: shift+tab is CSI Z (back-tab). */
export declare const MOBILE_KEY_BAR_KEYS: ReadonlyArray<{
    label: string;
    /** Byte sequence a tap writes to the PTY. Absent on the trackpad key — a
     *  plain tap there deliberately does nothing. */
    sequence?: string;
    /** Press-hold-slide emits arrow keys with the finger in all four
     *  directions, echoing the iOS space-bar trackpad (whose real caret
     *  gesture can't reach xterm — its textarea must stay empty for input
     *  diffing). Drives Claude Code's TUI menus (/resume, /model) and the
     *  input-line cursor; the iOS keyboard has no arrows of its own. */
    trackpad?: boolean;
}>;
/** Finger travel per emitted arrow while sliding on the trackpad key. */
export declare const MOBILE_TRACKPAD_STEP_PX = 16;
/** The paste key's prompt where script can't read the clipboard (plain-http
 *  origins): the user pastes into the native field instead. */
export declare const MOBILE_PASTE_PROMPT = "Paste into the terminal:";
/** visualViewport.height within this many px of innerHeight = nothing to
 *  clamp (the two disagree by sub-pixel rounding on some devices). */
export declare const VISUAL_VIEWPORT_FULL_EPSILON_PX = 1;
/** The visual viewport this far below the tallest seen at the current width
 *  (with an editable focused) = the software keyboard is up. Well above an
 *  address bar collapsing (~56 px), well below any on-screen keyboard. */
export declare const KEYBOARD_MIN_HEIGHT_PX = 150;
