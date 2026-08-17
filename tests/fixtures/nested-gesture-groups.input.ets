@Component
struct GestureDemo {
  build() {
    Stack()
    .gesture(
      GestureGroup(
        GestureMode.Parallel,
        PanGesture()
        .onActionStart((event: GestureEvent) => {
          if (this.enabled) {
          this.startX = event.offsetX;
          }
          }),
        PinchGesture()
        .onActionUpdate((event: GestureEvent) => {
          this.scale = event.scale;
          })
      )
    )
  }
}
