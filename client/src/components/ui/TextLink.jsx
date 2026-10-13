import ArrowMark from './ArrowMark.jsx';

export default function TextLink({ href, children }) {
  return (
    <a className="text-link" href={href}>
      <span>{children}</span>
      <ArrowMark />
    </a>
  );
}
