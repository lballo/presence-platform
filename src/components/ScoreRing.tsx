import { useEffect, useState, useRef } from "react";

interface ScoreRingProps {
  score: number;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

const sizeMap = {
  sm: { width: 80, stroke: 6 },
  md: { width: 120, stroke: 8 },
  lg: { width: 160, stroke: 10 },
};

function getScoreColor(score: number): string {
  if (score >= 80) return "var(--success)";
  if (score >= 65) return "var(--gold)";
  if (score >= 50) return "var(--warning)";
  return "var(--error)";
}

export default function ScoreRing({ score, size = "md", label, className = "" }: ScoreRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { width, stroke } = sizeMap[size];
  const radius = (width - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedScore / 100) * circumference;
  const color = getScoreColor(score);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const duration = 1500;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(score * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [isVisible, score]);

  const fontSize = size === "lg" ? "2.5rem" : size === "md" ? "1.75rem" : "1.25rem";

  return (
    <div ref={ref} className={`flex flex-col items-center ${className}`}>
      <div className="relative" style={{ width, height: width }}>
        <svg
          width={width}
          height={width}
          className="transform -rotate-90"
        >
          <circle
            cx={width / 2}
            cy={width / 2}
            r={radius}
            fill="none"
            stroke="var(--border-color)"
            strokeWidth={stroke}
          />
          <circle
            cx={width / 2}
            cy={width / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center font-display font-bold text-[var(--charcoal)]"
          style={{ fontSize }}
        >
          {animatedScore}
        </div>
      </div>
      {label && (
        <span className="text-sm font-medium text-[var(--muted-color)] mt-2">{label}</span>
      )}
    </div>
  );
}
