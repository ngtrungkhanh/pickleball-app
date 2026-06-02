import { AnalysisCenter } from '@/components/analysis/AnalysisCenter';

export const dynamic = 'force-static';

export default async function AnalysisPage() {
  return (
    <AnalysisCenter
      players={[]}
      matches={[]}
      seasons={[]}
      playerSeasonSettings={[]}
      config={{}}
      localOnly
    />
  );
}
