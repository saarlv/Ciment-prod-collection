---
name: charts
description: Building any kind of chart or data visualization in this project — line, bar, area, pie, radar, scatter, and composed charts using Recharts wrapped in the shadcn chart component (ChartContainer). Load this skill whenever the task mentions charts, graphs, analytics, dashboards with metrics, or any visual representation of data. Never build charts without this skill.
user-invocable: false
---

# Charts Skill

Charts are Recharts primitives wrapped in the shadcn `chart` component — `ChartContainer` plus `ChartTooltip` / `ChartTooltipContent` and `ChartLegend` / `ChartLegendContent`. Never a hand-rolled SVG or canvas chart: a custom implementation loses the theming, tooltip, and legend wiring `ChartContainer` provides. Install the component with the CLI if `src/components/ui/chart.tsx` doesn't exist, and pull its docs with `pnpm dlx shadcn@4.23.0 docs chart` before composing — the sub-component names and props differ from plain Recharts.

## Platform contract

1. **Every chart is wrapped in `ChartContainer`**, and never in `ResponsiveContainer` — `ChartContainer` already wraps its children in one, and nesting the two collapses the chart to zero height.
2. **The `config` prop is required** — human-readable labels plus theme-token colors, defined outside the JSX (that is where the series colors come from):

```tsx
const chartConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-1)' },
  expenses: { label: 'Expenses', color: 'var(--chart-2)' },
};
```

3. **`ChartContainer` sizes itself** via `aspect-video`, so pass height classes only when you want a ratio other than the default.
4. **Colors are the theme tokens `var(--chart-1)` … `var(--chart-5)` only.** A hardcoded hex or a Tailwind palette class (`bg-blue-500`) opts the chart out of the app's theme and breaks in dark mode. Tokens are the sanctioned exception to the "no colors in `style`/config" rule because they are CSS-variable references. Series props then reference the config-derived variables (`var(--color-<configKey>)`) per the chart component's docs; outside Recharts components use `bg-chart-*`, `text-chart-*`, `border-chart-*`, `fill-chart-*`.
