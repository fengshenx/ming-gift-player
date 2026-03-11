export function createInitialState() {
  return {
    animationId: null,
    backgroundImage: null,
    compositor: null,
    currentTime: 0,
    duration: 0,
    exporting: false,
    looping: true,
    player: null,
    playing: false,
    videoLoaded: false,
    videoName: '',
  };
}
