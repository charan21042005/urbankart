export default function ArrowMark({ direction = 'right' }) {
  return (
    <svg
      aria-hidden="true"
      className={`arrow-mark arrow-mark--${direction}`}
      viewBox="0 0 20 20"
      fill="none"
    >
      <path d="M3.5 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
