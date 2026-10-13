export default function PageContainer({ children, className = '', ...props }) {
  return <div className={`page-container ${className}`.trim()} {...props}>{children}</div>;
}
