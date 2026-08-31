const DISTRICTS = [
  { name: 'Arrivals', className: 'is-violet', rooms: ['welcome', 'broadcasts'] },
  { name: 'Workshop', className: 'is-cyan', rooms: ['project lab', 'showcase'] },
  { name: 'Commons', className: 'is-amber', rooms: ['general chat', 'voice lounge'] },
  { name: 'Quiet Wing', className: 'is-blue', rooms: ['reading room'] },
];

export function WorldMapPreview() {
  return (
    <div
      className="world-preview"
      role="img"
      aria-label="Preview of a pixel world with four Discord districts connected by paths"
    >
      <div className="world-preview-road world-preview-road--horizontal" />
      <div className="world-preview-road world-preview-road--vertical" />
      {DISTRICTS.map((district) => (
        <section className={`world-preview-district ${district.className}`} key={district.name}>
          <strong>{district.name}</strong>
          <div className="world-preview-rooms">
            {district.rooms.map((room) => (
              <span key={room} title={`#${room}`}>
                <i aria-hidden="true" />
              </span>
            ))}
          </div>
        </section>
      ))}
      <span className="world-preview-fountain" aria-hidden="true" />
      <span className="world-preview-avatar" aria-hidden="true">
        <img src="/game-assets/kenney-urban/tiles.png" alt="" />
      </span>
      <span className="world-preview-name" aria-hidden="true">you</span>
      <span className="world-preview-hint">Walk the world · find a room</span>
    </div>
  );
}
