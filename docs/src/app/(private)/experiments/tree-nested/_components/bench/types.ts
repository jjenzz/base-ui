import type { BenchItem } from './data';

export interface BenchTreeProps {
  items: BenchItem[];
  expanded: string[];
  onExpandedChange: (expanded: string[]) => void;
}
