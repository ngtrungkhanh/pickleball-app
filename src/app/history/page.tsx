import HistoryClient from '@/components/HistoryClient';
import { shouldBlockPreviewWrites } from '@/lib/environment';

export const dynamic = 'force-static';

export default function HistoryPage() {
  return (
    <HistoryClient
      initialPlayers={[]}
      initialMatches={[]}
      initialConfig={{}}
      initialSeasons={[]}
      initialPlayerSeasonSettings={[]}
      previewWritesBlocked={shouldBlockPreviewWrites()}
    />
  );
}
