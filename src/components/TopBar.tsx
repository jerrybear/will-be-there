interface TopBarProps {
  onReset: () => void;
}

export function TopBar({ onReset }: TopBarProps) {
  return (
    <header className="top-bar">
      <div>
        <h1>이거여기</h1>
        <p>옮기기 전에, 여기 한번 놔보기</p>
      </div>
      <button type="button" className="ghost-button" onClick={onReset}>
        Reset
      </button>
    </header>
  );
}
