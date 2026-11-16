import React, { memo } from "react";
import "./PlatformBubbleBackground.css";

type BubbleColor = "violet" | "blue" | "cyan" | "purple";
type BubbleMotion = "a" | "b" | "c" | "d";
type BubbleDepth = "spark" | "near" | "mid" | "far";

interface BubbleSpec {
  id: number;
  left: number; // % across dashboard workspace width
  size: number; // px
  duration: number; // seconds
  delay: number; // negative seconds so bubbles start mid-flight immediately
  alpha: number; // wrapper opacity (0..1)
  restTop: number; // vh anchor used for minimal drift when reduced motion is preferred
  color: BubbleColor;
  motion: BubbleMotion;
  depth: BubbleDepth;
  secondary?: boolean; // hidden below 768px to keep mobile density & GPU light
}

// Balanced scatter across workspace width, sizes, colors, and speeds
const BUBBLES: readonly BubbleSpec[] = [
  { id: 1, left: 4, size: 18, duration: 15, delay: -3, alpha: 0.72, restTop: 22, color: "cyan", motion: "a", depth: "near" },
  { id: 2, left: 9, size: 42, duration: 23, delay: -14, alpha: 0.48, restTop: 64, color: "violet", motion: "b", depth: "mid", secondary: true },
  { id: 3, left: 13, size: 11, duration: 14, delay: -8, alpha: 0.78, restTop: 42, color: "blue", motion: "c", depth: "spark" },
  { id: 4, left: 18, size: 58, duration: 27, delay: -21, alpha: 0.36, restTop: 78, color: "purple", motion: "d", depth: "far", secondary: true },
  { id: 5, left: 23, size: 26, duration: 18, delay: -6, alpha: 0.66, restTop: 28, color: "cyan", motion: "b", depth: "near" },
  { id: 6, left: 28, size: 15, duration: 16, delay: -12, alpha: 0.74, restTop: 56, color: "violet", motion: "a", depth: "near", secondary: true },
  { id: 7, left: 33, size: 48, duration: 24, delay: -17, alpha: 0.44, restTop: 70, color: "blue", motion: "c", depth: "far" },
  { id: 8, left: 38, size: 22, duration: 17, delay: -2, alpha: 0.68, restTop: 16, color: "purple", motion: "d", depth: "near", secondary: true },
  { id: 9, left: 43, size: 10, duration: 13, delay: -7, alpha: 0.8, restTop: 48, color: "cyan", motion: "a", depth: "spark" },
  { id: 10, left: 48, size: 38, duration: 21, delay: -15, alpha: 0.52, restTop: 84, color: "violet", motion: "b", depth: "mid", secondary: true },
  { id: 11, left: 53, size: 64, duration: 28, delay: -9, alpha: 0.34, restTop: 34, color: "blue", motion: "d", depth: "far" },
  { id: 12, left: 58, size: 18, duration: 16, delay: -11, alpha: 0.74, restTop: 60, color: "cyan", motion: "c", depth: "near", secondary: true },
  { id: 13, left: 63, size: 34, duration: 20, delay: -4, alpha: 0.58, restTop: 24, color: "purple", motion: "a", depth: "mid" },
  { id: 14, left: 68, size: 12, duration: 14, delay: -10, alpha: 0.78, restTop: 74, color: "blue", motion: "b", depth: "spark", secondary: true },
  { id: 15, left: 73, size: 46, duration: 25, delay: -19, alpha: 0.46, restTop: 44, color: "violet", motion: "c", depth: "mid" },
  { id: 16, left: 78, size: 24, duration: 17, delay: -13, alpha: 0.7, restTop: 18, color: "cyan", motion: "d", depth: "near", secondary: true },
  { id: 17, left: 82, size: 54, duration: 26, delay: -20, alpha: 0.38, restTop: 66, color: "blue", motion: "a", depth: "far" },
  { id: 18, left: 86, size: 16, duration: 15, delay: -5, alpha: 0.74, restTop: 38, color: "purple", motion: "b", depth: "near", secondary: true },
  { id: 19, left: 90, size: 36, duration: 22, delay: -16, alpha: 0.54, restTop: 80, color: "cyan", motion: "c", depth: "mid" },
  { id: 20, left: 94, size: 28, duration: 19, delay: -9, alpha: 0.64, restTop: 52, color: "blue", motion: "d", depth: "near" },
  { id: 21, left: 50, size: 14, duration: 15, delay: -12, alpha: 0.76, restTop: 14, color: "violet", motion: "a", depth: "near" },
  { id: 22, left: 75, size: 20, duration: 18, delay: -7, alpha: 0.68, restTop: 58, color: "cyan", motion: "b", depth: "near", secondary: true },
];

type BubbleOrbStyle = React.CSSProperties & {
  "--b-calm-dur": string;
};

function PlatformBubbleBackgroundComponent() {
  return (
    <div className="platform-bubble-layer" aria-hidden="true">
      {BUBBLES.map((bubble) => {
        const slotStyle: React.CSSProperties = {
          left: `${bubble.left}%`,
          width: `${bubble.size}px`,
          height: `${bubble.size}px`,
          opacity: bubble.alpha,
        };

        const orbStyle: BubbleOrbStyle = {
          animationDuration: `${bubble.duration}s`,
          animationDelay: `${bubble.delay}s`,
          "--b-calm-dur": `${Math.round(bubble.duration * 1.55)}s`,
        };

        return (
          <span
            key={bubble.id}
            style={slotStyle}
            className={`platform-bubble-slot ${bubble.secondary ? "is-secondary" : ""}`}
          >
            <span
              style={orbStyle}
              className={[
                "platform-bubble",
                `tone-${bubble.color}`,
                `motion-${bubble.motion}`,
                `depth-${bubble.depth}`,
              ].join(" ")}
            />
          </span>
        );
      })}
    </div>
  );
}

export const PlatformBubbleBackground = memo(PlatformBubbleBackgroundComponent);
