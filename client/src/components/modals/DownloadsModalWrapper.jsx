import DownloadsModal from "./DownloadsModal";
import { useUIStore } from "../../stores/uiStore";

export default function DownloadsModalWrapper() {
  const isDownloadsOpen = useUIStore((s) => s.isDownloadsOpen);
  const closeDownloads = useUIStore((s) => s.closeDownloads);

  return (
    <DownloadsModal
      isOpen={isDownloadsOpen}
      onClose={closeDownloads}
    //   channelId={channelId}
    />
  );
}