import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { sourceTitle } from '../convex/lib/answerRules';

export function AnswerMarkdown({ answer, sources }: { answer: string; sources: { title: string; url: string }[] }) {
  const allowed = new Map(sources.filter(s => /^https?:\/\//.test(s.url)).map(s => [s.url, s]));
  return <ReactMarkdown remarkPlugins={[remarkBreaks]} skipHtml
    urlTransform={url => allowed.has(url) ? url : ''}
    components={{
      a: ({ href, children }) => {
        const source = href ? allowed.get(href) : undefined;
        return source ? <a href={source.url} target="_blank" rel="noopener noreferrer">{sourceTitle(source.title)}</a> : <span>{children}</span>;
      },
      img: () => null,
    }}>{answer}</ReactMarkdown>;
}
