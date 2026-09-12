"""Generates the static PNG charts embedded in README.md / RESULTS.md.
Re-run after any change to the numbers it plots (see the values below).
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "images")
os.makedirs(OUT_DIR, exist_ok=True)

# Palette (dataviz skill default, light mode) -- fixed identity mapping
# reused across every chart: Tier1=blue, Tier2=orange, Tier3=aqua,
# English control=yellow.
BLUE = "#2a78d6"
ORANGE = "#eb6834"
AQUA = "#1baf7a"
YELLOW = "#eda100"

SURFACE = "#fcfcfb"
INK_PRIMARY = "#0b0b0b"
INK_SECONDARY = "#52514e"
INK_MUTED = "#898781"
GRIDLINE = "#e1e0d9"
BASELINE = "#c3c2b7"

plt.rcParams["font.family"] = "sans-serif"
plt.rcParams["font.sans-serif"] = ["Segoe UI", "DejaVu Sans", "Arial"]


def bar_chart(filename, title, labels, values, colors, ylabel, value_fmt="{:.1f}", ymax=None):
    fig, ax = plt.subplots(figsize=(6, 4), dpi=200)
    fig.patch.set_facecolor(SURFACE)
    ax.set_facecolor(SURFACE)

    bars = ax.bar(labels, values, color=colors, width=0.55, zorder=3)

    ax.set_title(title, color=INK_PRIMARY, fontsize=13, fontweight="bold", pad=14, loc="left")
    ax.set_ylabel(ylabel, color=INK_SECONDARY, fontsize=10)
    if ymax is not None:
        ax.set_ylim(0, ymax)

    ax.yaxis.grid(True, color=GRIDLINE, linewidth=1, zorder=0)
    ax.set_axisbelow(True)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)
    ax.spines["bottom"].set_color(BASELINE)
    ax.tick_params(axis="x", colors=INK_SECONDARY, labelsize=10, length=0)
    ax.tick_params(axis="y", colors=INK_MUTED, labelsize=9, length=0)

    for bar, val in zip(bars, values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + (ax.get_ylim()[1] * 0.02),
            value_fmt.format(val),
            ha="center", va="bottom",
            color=INK_PRIMARY, fontsize=10, fontweight="bold",
        )

    fig.tight_layout()
    path = os.path.join(OUT_DIR, filename)
    fig.savefig(path, facecolor=SURFACE)
    plt.close(fig)
    print("wrote", path)


# 7c -- bits-per-character across all four corpora
bar_chart(
    "bits_per_char.png",
    "Validation bits/character (lower = more predictable)",
    ["Tier 1", "Tier 2", "Tier 3", "English\ncontrol"],
    [1.4772, 1.4783, 0.2926, 0.3279],
    [BLUE, ORANGE, AQUA, YELLOW],
    ylabel="bits/char",
    value_fmt="{:.2f}",
    ymax=1.7,
)

# 7b -- grammar-adherence rate, Lojban tiers only (English isn't Lojban)
bar_chart(
    "grammar_adherence.png",
    "Grammar-adherence rate (% of samples that parse)",
    ["Tier 1", "Tier 2", "Tier 3"],
    [64.5, 61.3, 99.5],
    [BLUE, ORANGE, AQUA],
    ylabel="% valid",
    value_fmt="{:.1f}%",
    ymax=110,
)

# 7a -- HEADLINE result: hallucination rate, Lojban Tier 3 vs English control
bar_chart(
    "hallucination_rate.png",
    "Hallucination rate vs. toy-world ground truth (7a headline)",
    ["Lojban Tier 3", "English control"],
    [10.9, 1.7],
    [AQUA, YELLOW],
    ylabel="% of checkable claims false",
    value_fmt="{:.1f}%",
    ymax=13,
)
