export type AnalysisNavigationEvent = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
};

export function navigateToAnalysis(event: AnalysisNavigationEvent, navigate: (href: string) => void) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }

  event.preventDefault();
  navigate('/analysis');
  return true;
}
