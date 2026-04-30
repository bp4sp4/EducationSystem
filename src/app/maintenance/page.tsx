export default function MaintenancePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F2F4F6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '48px 40px',
          textAlign: 'center',
          maxWidth: '400px',
          width: '100%',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: '700',
            color: '#191F28',
            marginBottom: '12px',
          }}
        >
          서비스 점검 중
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: '#8B95A1',
            lineHeight: '1.6',
          }}
        >
          현재 시스템 점검 중입니다.
          <br />
          잠시 후 다시 접속해 주세요.
        </p>
      </div>
    </div>
  );
}
