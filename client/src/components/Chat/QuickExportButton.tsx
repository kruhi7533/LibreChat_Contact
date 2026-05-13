import { useState, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { Download } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import ExportModal from '~/components/Nav/ExportConversation/ExportModal';
import { useLocalize } from '~/hooks';
import store from '~/store';

function QuickExportButton() {
  const localize = useLocalize();
  const [showExports, setShowExports] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const conversation = useRecoilValue(store.conversationByIndex(0));

  const exportable =
    conversation &&
    conversation.conversationId != null &&
    conversation.conversationId !== 'new' &&
    conversation.conversationId !== 'search';

  if (!exportable) {
    return null;
  }

  return (
    <>
      <TooltipAnchor
        description={localize('com_endpoint_export')}
        role="button"
        tabIndex={0}
        aria-label={localize('com_endpoint_export')}
        onClick={() => setShowExports(true)}
        data-testid="quick-export-button"
        className="inline-flex size-9 flex-shrink-0 items-center justify-center rounded-xl border border-border-light bg-presentation text-text-primary transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50 radix-state-open:bg-surface-tertiary"
      >
        <Download className="icon-sm" aria-hidden="true" />
      </TooltipAnchor>
      <ExportModal
        open={showExports}
        onOpenChange={setShowExports}
        conversation={conversation}
        triggerRef={buttonRef}
        aria-label={localize('com_ui_export_convo_modal')}
      />
    </>
  );
}

export default QuickExportButton;
