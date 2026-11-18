/**
 * Umfrage abschließen — 3-Schritt-Wizard.
 * Steps: 1) Offene Umfrage wählen → 2) Finalen Termin aus den Vorschlägen wählen → 3) Prüfen & Umfrage schließen.
 * Reads: umfragen, terminvorschlaege. Writes: umfragen (finaler_termin, status=geschlossen) via useUmfrageAbschliessenFlow.
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldDate, fieldLookup, fieldRef } from '@/lib/journey';
import { useUmfrageAbschliessenFlow } from '@/lib/journey/flows/UmfrageAbschliessen';
import { lookupLabel, tx } from '@/i18n';

function readDate(iso: string | null): string {
  if (!iso) return '?';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, 'dd.MM.yyyy, HH:mm');
}

export default function UmfrageAbschliessenPage() {
  const [step, setStep] = useState(1);
  const [umfrageId, setUmfrageId] = useState<string | null>(null);

  const flow = useUmfrageAbschliessenFlow({
    steps: { umfragen: 1, finaler_termin: 2 },
    items: {
      umfragen: r => {
        const status = fieldLookup(r, 'status');
        return {
          id: r.id,
          title: fieldText(r, 'titel'),
          subtitle: fieldText(r, 'ort') || undefined,
          status: status ?? undefined,
        };
      },
      finaler_termin: r => ({
        id: r.id,
        title: tx`${readDate(fieldDate(r, 'beginn'))} bis ${readDate(fieldDate(r, 'ende'))}`,
      }),
    },
    where: {
      umfragen: r => fieldLookup(r, 'status')?.key === 'offen',
      finaler_termin: r => umfrageId !== null && fieldRef(r, 'umfrage') === umfrageId,
    },
  });

  const umfragePick = flow.pick('umfragen');

  return (
    <IntentWizardShell
      title={tx('Umfrage abschließen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{ description: tx('Finalen Termin festlegen und die Abstimmung beenden.'), needs: [tx('Die Umfrage, die du schließen willst')] }}
    >
      <WizardStep label={tx('Umfrage')} description={tx('Welche offene Umfrage soll geschlossen werden?')}>
        <EntitySelectStep
          {...flow.picks.umfragen.select}
          {...umfragePick}
          avatar="none"
          searchPlaceholder={tx('Titel suchen …')}
          emptyText={tx('Es gibt keine offene Umfrage mehr.')}
          onSelect={id => {
            setUmfrageId(id);
            umfragePick.onSelect(id);
          }}
        />
      </WizardStep>
      <WizardStep label={tx('Finaler Termin')} description={tx('Welcher Terminvorschlag wird der finale Termin?')}>
        {umfrageId ? (
          <EntitySelectStep
            {...flow.picks.finaler_termin.select}
            {...flow.pick('finaler_termin')}
            avatar="none"
            create={false}
            emptyText={tx('Diese Umfrage hat noch keine Terminvorschläge.')}
          />
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
          </StepNav>
        )}
      </WizardStep>
      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            confirmLabel={tx('Umfrage schließen')}
            items={[{ key: 'status', label: tx('Status'), value: lookupLabel('umfragen', 'status', 'geschlossen') ?? tx('Geschlossen') }]}
            whatHappensNext={tx('Die öffentliche Seite zeigt danach den finalen Termin und die Tabelle. Abstimmen ist nicht mehr möglich.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          undo={flow.undo}
          whatHappensNext={tx('Mit „Umfrage wieder öffnen“ kannst du die Abstimmung wieder freigeben.')}
          next={[
            { label: tx('Neue Umfrage anlegen'), href: '#/intents/umfrage-anlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
