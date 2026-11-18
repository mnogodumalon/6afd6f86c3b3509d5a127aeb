import { useState } from 'react';
import { IconPlus, IconCalendarEvent, IconMapPin, IconUsers, IconCheck, IconTrophy } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { flowActionFor, decided, countOf } from '@/config/plan';
import { extractRecordId } from '@/services/livingAppsService';
import { lookupKey, formatDateTime } from '@/lib/formatters';
import { appLabel, tx } from '@/i18n';
import { useClock, gruss, namen } from '@/lib/polish';
import { submissionsOf, topOne } from '@/lib/journey';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { RecordDoorLink } from '@/components/widgets/RecordDoorLink';
import { Button } from '@/components/ui/button';
import type { EnrichedUmfragen } from '@/types/enriched';

type Filter = 'all' | 'offen' | 'geschlossen' | 'leer';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { terminvorschlaege, antworten, terminvorschlaegeMap } = data;
  const clock = useClock();
  const [filter, setFilter] = useState<Filter>('all');

  // The deciding step belongs to the flow "umfrage-abschliessen" — this page only opens it.
  const closeAction = (u: EnrichedUmfragen) =>
    lookupKey(u.fields.status) === 'geschlossen' ? null : flowActionFor('umfragen', 'status', u.record_id, 'geschlossen');

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type !== 'umfragen') return undefined;
      const go = closeAction(top.record);
      return go ? { label: tx('Termin festlegen & schließen'), onClick: go } : undefined;
    },
  });
  const umfragen = crud.enriched.umfragen;

  const stats = umfragen.map(u => {
    const termine = terminvorschlaege.filter(t => extractRecordId(t.fields.umfrage) === u.record_id);
    const ans = antworten.filter(a => extractRecordId(a.fields.umfrage) === u.record_id);
    const teilnahmen = submissionsOf(ans, { key: 'teilnahme_kennung', names: ['vorname', 'nachname'] }).length;
    const perTermin = termine.map(t => {
      const mine = ans.filter(a => extractRecordId(a.fields.terminvorschlag) === t.record_id);
      return {
        t,
        ja: mine.filter(a => lookupKey(a.fields.antwort) === 'ja').length,
        vielleicht: mine.filter(a => lookupKey(a.fields.antwort) === 'vielleicht').length,
      };
    });
    const top = topOne(perTermin, [p => p.ja, p => p.vielleicht], p => p.t.fields.beginn);
    return { u, termine: termine.length, teilnahmen, top, isOpen: lookupKey(u.fields.status) !== 'geschlossen' };
  });

  const open = stats.filter(s => s.isOpen);
  const closed = stats.filter(s => !s.isOpen);
  const noAnswers = open.filter(s => s.teilnahmen === 0);
  const toDecide = open.filter(s => s.teilnahmen > 0 && !decided('umfragen', 'finaler_termin', s.u.fields));

  const visible = stats.filter(s =>
    filter === 'all' ? true : filter === 'offen' ? s.isOpen : filter === 'geschlossen' ? !s.isOpen : s.isOpen && s.teilnahmen === 0);
  const toggle = (f: Filter) => setFilter(cur => (cur === f ? 'all' : f));

  const latest = submissionsOf(antworten, { key: 'teilnahme_kennung', names: ['vorname', 'nachname'] })
    .slice().reverse().slice(0, 5);

  let context: string;
  if (stats.length === 0) context = tx('Lege deine erste Umfrage an und teile den Link.');
  else if (toDecide.length > 0) context = tx`Bei ${namen(toDecide.map(s => s.u.fields.titel ?? ''))} wartet die Abstimmung auf deine Entscheidung.`;
  else if (open.length > 0) context = tx`${namen(open.map(s => s.u.fields.titel ?? ''))} läuft noch — bisher ohne Rückmeldungen.`;
  else context = tx`${namen(closed.map(s => s.u.fields.titel ?? ''))} ist abgeschlossen — alle Termine stehen fest.`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground">{context}</p>
        </div>
        {crud.umfragen.canWrite && (
          <Button onClick={() => crud.umfragen.openCreate({ status: 'offen' })} className="w-full sm:w-auto">
            <IconPlus size={16} className="shrink-0" />
            {tx('Neue Umfrage')}
          </Button>
        )}
      </div>

      <DashboardGrid
        variant="split"
        kpis={stats.length > 0 && (
          <StatStrip>
            <StatStripItem
              title={tx('Offen')} value={open.length} tone="primary"
              onClick={() => toggle('offen')} active={filter === 'offen'}
            />
            <StatStripItem
              title={tx('Ohne Antworten')} value={noAnswers.length}
              tone={noAnswers.length > 0 ? 'warning' : 'default'}
              onClick={() => toggle('leer')} active={filter === 'leer'}
            />
            <StatStripItem
              title={tx('Geschlossen')} value={closed.length}
              onClick={() => toggle('geschlossen')} active={filter === 'geschlossen'}
            />
          </StatStrip>
        )}
        aside={
          <>
            <WorkList
              title={tx('Zu entscheiden')}
              items={toDecide.map(s => {
                const go = closeAction(s.u);
                return {
                  id: s.u.record_id,
                  title: s.u.fields.titel ?? '—',
                  secondLine: (
                    <span className="text-muted-foreground">
                      {countOf('antworten', s.teilnahmen, appLabel('antworten'))}
                      {s.top ? ` · ${formatDateTime(s.top.t.fields.beginn)}` : ''}
                    </span>
                  ),
                  action: go ? { label: tx('Festlegen'), onClick: go } : undefined,
                };
              })}
              onItemClick={id => { const r = data.umfragen.find(x => x.record_id === id); if (r) crud.umfragen.openDetail(r); }}
              empty={{ text: tx('Nichts offen — sobald Antworten eintreffen, kannst du hier den Termin festlegen.') }}
            />
            <WorkList
              title={tx('Neueste Teilnahmen')}
              items={latest.map(s => {
                const rec = s.records[0];
                const uid = extractRecordId(rec.fields.umfrage);
                const u = umfragen.find(x => x.record_id === uid);
                return {
                  id: uid ?? s.key,
                  title: s.name || '—',
                  secondLine: <span className="text-muted-foreground">{u?.fields.titel ?? ''}</span>,
                };
              })}
              onItemClick={id => { const r = data.umfragen.find(x => x.record_id === id); if (r) crud.umfragen.openDetail(r); }}
              empty={{ text: tx('Noch niemand hat abgestimmt.') }}
            />
          </>
        }
        primary={
          <div className="space-y-3">
            {visible.length === 0 && (
              <div className="rounded-[27px] bg-card shadow-sm p-8 text-center space-y-3">
                <IconCalendarEvent size={48} className="mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {stats.length === 0 ? tx('Noch keine Umfrage — starte mit der ersten.') : tx('Keine Umfrage in dieser Ansicht.')}
                </p>
                {stats.length === 0 && crud.umfragen.canWrite && (
                  <Button onClick={() => crud.umfragen.openCreate({ status: 'offen' })}>{tx('Erste Umfrage anlegen')}</Button>
                )}
              </div>
            )}
            {visible.map(({ u, termine, teilnahmen, top, isOpen }) => {
              const go = closeAction(u);
              const finalRec = decided('umfragen', 'finaler_termin', u.fields)
                ? terminvorschlaegeMap.get(extractRecordId(u.fields.finaler_termin) ?? '')
                : undefined;
              const raw = data.umfragen.find(x => x.record_id === u.record_id)!;
              return (
                <div key={u.record_id} className="rounded-[27px] bg-card shadow-sm p-4 sm:p-5 space-y-3 overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button type="button" onClick={() => crud.umfragen.openDetail(raw)} className="min-w-0 text-left">
                      <h3 className="font-semibold truncate">{u.fields.titel ?? '—'}</h3>
                      <p className={isOpen ? 'text-xs font-medium text-emerald-600' : 'text-xs font-medium text-muted-foreground'}>
                        {u.fields.status?.label ?? ''}
                      </p>
                    </button>
                    {go && (
                      <Button size="sm" variant="outline" onClick={go}>
                        <IconCheck size={14} className="shrink-0" />
                        {tx('Termin festlegen')}
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {u.fields.ort && <span className="inline-flex items-center gap-1 min-w-0"><IconMapPin size={14} className="shrink-0" /><span className="truncate">{u.fields.ort}</span></span>}
                    <span className="inline-flex items-center gap-1"><IconCalendarEvent size={14} className="shrink-0" />{countOf('terminvorschlaege', termine, appLabel('terminvorschlaege'))}</span>
                    <span className="inline-flex items-center gap-1"><IconUsers size={14} className="shrink-0" />{countOf('antworten', teilnahmen, appLabel('antworten'))}</span>
                  </div>
                  {finalRec ? (
                    <p className="text-sm font-medium inline-flex items-center gap-1"><IconTrophy size={14} className="shrink-0 text-amber-600" />{tx`Final: ${formatDateTime(finalRec.fields.beginn)}`}</p>
                  ) : top ? (
                    <p className="text-sm inline-flex items-center gap-1"><IconTrophy size={14} className="shrink-0 text-amber-600" />{tx`Vorn: ${formatDateTime(top.t.fields.beginn)} (${top.ja} Ja, ${top.vielleicht} Vielleicht)`}</p>
                  ) : null}
                  <RecordDoorLink page="termin-abstimmen" recordId={u.record_id} qr />
                </div>
              );
            })}
          </div>
        }
      />
      {crud.surfaces}
    </div>
  );
}
