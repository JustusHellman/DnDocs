import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { usePeek } from '../../contexts/PeekContext';

const ENTITY_LINK = /^#?\/entity\/([^/?#]+)/;

function EntityLink({ id, children }: { id: string; children: React.ReactNode }) {
  const { entityMap, canView } = useCampaignData();
  const { peek } = usePeek();
  const target = entityMap.get(decodeURIComponent(id));
  // Linking a secret entry from shared text mustn't give its name away.
  if (target && !canView(target)) {
    return (
      <span className="text-stone-500 italic" title="Not revealed yet">
        ???
      </span>
    );
  }
  if (!target) return <span className="text-stone-400">{children}</span>;
  return (
    <button type="button" className="link inline text-left" onClick={(e) => peek(target, { newSlot: e.ctrlKey || e.metaKey })}>
      {children}
    </button>
  );
}

const components: Components = {
  a: ({ href = '', children, node: _node, ...rest }) => {
    const match = href.match(ENTITY_LINK);
    if (match) return <EntityLink id={match[1]}>{children}</EntityLink>;
    if (href.startsWith('/')) {
      return (
        <Link to={href} className="link">
          {children}
        </Link>
      );
    }
    return (
      <a {...rest} href={href} target="_blank" rel="noopener noreferrer" className="link">
        {children}
      </a>
    );
  },
  img: ({ node: _node, ...props }) => <img {...props} loading="lazy" className="rounded-lg" referrerPolicy="no-referrer" />,
  table: ({ node: _node, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
};

export const Markdown = memo(function Markdown({ source, className }: { source?: string | null; className?: string }) {
  if (!source?.trim()) return null;
  return (
    <div
      className={clsx(
        'prose prose-ledger max-w-none break-words',
        'prose-headings:font-display prose-headings:text-stone-100 prose-a:no-underline prose-p:leading-relaxed',
        'prose-hr:border-stone-800 prose-th:text-stone-300 prose-blockquote:border-amber-700/60 prose-blockquote:text-stone-300',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
});
