import { Toasts } from "./components/Toasts";
import { useRoute } from "./lib/router";
import { Home } from "./screens/Home";
import { RoomScreen } from "./screens/RoomScreen";
import { StreamScreen } from "./screens/StreamScreen";

function Backdrop() {
  return (
    <div className="aurora" aria-hidden="true">
      <span className="aurora-a" />
      <span className="aurora-b" />
      <span className="aurora-c" />
      <div className="grain" />
    </div>
  );
}

export function App() {
  const route = useRoute();
  return (
    <>
      <Backdrop />
      {route.name === "home" && <Home />}
      {route.name === "room" && <RoomScreen key={route.code} code={route.code} />}
      {route.name === "watch" && <StreamScreen key={route.code} code={route.code} />}
      <Toasts />
    </>
  );
}
