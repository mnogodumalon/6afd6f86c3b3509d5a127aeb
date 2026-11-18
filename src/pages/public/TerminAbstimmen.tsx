import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import { OptionVote } from '@/components/blocks/OptionVote';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import {
  loadPublicPagesConfig, PageUnavailableError,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import { VOTES, fieldText, fieldLookup, type JourneyRecord } from '@/lib/journey';
import { tx } from '@/i18n';

const SLUG = 'termin-abstimmen';
// teilnahme_kennung (derived:record_key): OptionVote makes it with newRecordKey() once per send
// and remembers it via rememberSubmission — this page never renders or sets it.

export default function TerminAbstimmen() {
  const [params] = useSearchParams();
  const linkedId = params.get('umfrage');
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<JourneyRecord | null>(null);
  const [recordLoaded, setRecordLoaded] = useState(false);
  const [dead, setDead] = useState(false);
  const [problem, setProblem] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    loadPublicPagesConfig(SLUG).then(c => {
      setCfg(c);
      setPage(c?.pages[SLUG] ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  useEffect(() => {
    if (!port || !linkedId) return;
    let cancelled = false;
    setProblem(false);
    port.get('umfragen', linkedId).then(r => {
      if (cancelled) return;
      setRecord(r);
      setRecordLoaded(true);
      if (!r) setDead(true);
    }).catch(e => {
      if (cancelled) return;
      if (e instanceof PageUnavailableError) setDead(true);
      else setProblem(true);
    });
    return () => { cancelled = true; };
  }, [port, linkedId, attempt]);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }

  if (!linkedId) {
    return (
      <PublicShell title={page.title} description={page.description}>
        <p className="text-sm text-muted-foreground">
          {tx('Bitte öffne den Link oder scanne den QR-Code zu deiner Umfrage.')}
        </p>
      </PublicShell>
    );
  }

  if (dead) {
    return (
      <PublicShell title={page.title} description={page.description}>
        <p className="text-sm">
          {tx('Dieser Link ist nicht mehr gültig. Bitte den aktuellen Link oder QR-Code verwenden.')}
        </p>
      </PublicShell>
    );
  }

  if (problem && !recordLoaded) {
    return (
      <PublicShell title={page.title} description={page.description}>
        <LoadProblem onRetry={() => setAttempt(a => a + 1)} />
      </PublicShell>
    );
  }

  const title = record ? fieldText(record, 'titel') : '';
  const beschreibung = record ? fieldText(record, 'beschreibung') : '';
  const ort = record ? fieldText(record, 'ort') : '';
  const closed = record ? fieldLookup(record, 'status')?.key === 'geschlossen' : false;

  return (
    <PublicShell title={title || page.title} description={page.description}>
      <div className="space-y-4 min-w-0">
        {(beschreibung || ort) && (
          <div className="space-y-1 text-sm">
            {beschreibung && <p className="whitespace-pre-line break-words">{beschreibung}</p>}
            {ort && <p className="text-muted-foreground break-words">{tx('Ort')}: {ort}</p>}
          </div>
        )}
        {closed && (
          <p className="text-sm font-medium">{tx('Die Umfrage ist geschlossen. Hier siehst du das Ergebnis.')}</p>
        )}
        <OptionVote
          port={port}
          vote={VOTES[SLUG]}
          parentId={linkedId}
          draftKey={SLUG}
        />
      </div>
    </PublicShell>
  );
}
