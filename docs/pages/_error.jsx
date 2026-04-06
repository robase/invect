function Error() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Something went wrong</h2>
      <a href="/docs" style={{ color: '#3b82f6' }}>Go to documentation</a>
    </div>
  );
}

Error.getInitialProps = () => ({ statusCode: 500 });

export default Error;
