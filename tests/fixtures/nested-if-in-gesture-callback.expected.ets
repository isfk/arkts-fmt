class GestureHandler {
  private update(panFx: number): void {
    PanGesture()
      .onActionUpdate(() => {
        if (this.isPinching) {
          if (panFx >= 0) {
            this.panFingerStartX = panFx;
            this.panStartScrollOffset = this.scrollOffset;
          }
          return;
        }
      })
  }
}
