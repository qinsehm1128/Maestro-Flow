import type { MaestroSessionListItem } from '@/shared/maestro-session-types.js';
import type { SessionDetail } from '@/client/store/maestro-coordinate-store.js';
import { SOURCE_COLORS, formatTimestamp } from './constants.js';
import { MetaField } from './SessionDetailPanel.js';
import { StepsTimeline } from './StepsTimeline.js';
import { SessionContextCard } from './SessionContextCard.js';

// ---------------------------------------------------------------------------
// SessionDetailPanel — right panel showing selected session details
// ---------------------------------------------------------------------------

export function SessionDetailContent({
  session,
  detail,
}: {
  session: MaestroSessionListItem;
  detail: SessionDetail;
}) {
  const sourceColor = SOURCE_COLORS[session.source] ?? '#A09D97';

  return (
    <div className="p-5 overflow-y-auto h-full">
      {/* ---- Header card ---- */}
      <div className="bg-bg-card border border-border-divider rounded-[10px] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-[10px] border-b border-border-divider">
          <div className="flex items-center gap-2">
            <div
              className="w-[10px] h-[10px] rounded-full"
              style={{ background: sourceColor }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              {session.source}
            </span>
          </div>
          <StatusPill status={session.status} />
        </div>
        <div className="p-4">
          {/* Intent */}
          <div className="text-[14px] font-semibold text-text-primary leading-snug mb-3">
            {session.intent}
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
            {session.chainName && (
              <MetaField label="Chain" value={session.chainName} />
            )}
            {session.lifecyclePosition && (
              <MetaField label="Lifecycle" value={session.lifecyclePosition} />
            )}
            {session.phase != null && (
              <MetaField label="Phase" value={String(session.phase)} />
            )}
            {session.milestone && (
              <MetaField label="Milestone" value={session.milestone} />
            )}
            <MetaField
              label="Progress"
              value={`${session.currentStep}/${session.totalSteps}`}
            />
            <MetaField label="Updated" value={formatTimestamp(session.updatedAt)} />
          </div>
        </div>
      </div>

      {/* ---- Steps Timeline card ---- */}
      <div className="bg-bg-card border border-border-divider rounded-[10px] overflow-hidden mt-4">
        <div className="flex items-center justify-between px-4 py-[10px] border-b border-border-divider">
          <span className="text-[length:var(--font-size-sm)] font-semibold text-text-primary">
            Steps
          </span>
          {detail.source === 'coordinate' && (
            <span className="text-[10px] text-text-tertiary">
              Node: <span className="font-mono">{detail.data.current_node}</span>
            </span>
          )}
        </div>
        <div className="p-4">
          <StepsTimeline detail={detail} />
        </div>
      </div>

      {/* ---- Context card (ralph only) ---- */}
      {detail.source === 'ralph' && (
        <div className="bg-bg-card border border-border-divider rounded-[10px] overflow-hidden mt-4">
          <div className="px-4 py-[10px] border-b border-border-divider">
            <span className="text-[length:var(--font-size-sm)] font-semibold text-text-primary">
              Context
            </span>
          </div>
          <div className="p-4">
            <SessionContextCard detail={detail} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusPill — inline pill using color18 pattern
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: string }) {
  const STATUS_COLORS: Record<string, string> = {
    running: '#4A90D9',
    in_progress: '#4A90D9',
    completed: '#5A9E78',
    failed: '#C46555',
    pending: '#A09D97',
    idle: '#A09D97',
    verifying: '#D4832E',
    paused: '#A09D97',
  };
  const color = STATUS_COLORS[status] ?? '#A09D97';

  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: `${color}18`, color }}
    >
      {status}
    </span>
  );
}
