export default function Layout({ children }) {
  return (
    <div className="no-blur">
      <div id="preloader"></div>
      <div id="bg1"></div>
      <div id="top-bar">Top Bar</div>
      <div id="top-settings-holder">
        <div id="ai-config-button" className="drawer">Left Nav Drawer Placeholder</div>
      </div>
      {children}
    </div>
  );
}