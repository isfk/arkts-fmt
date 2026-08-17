@Component
struct CallbackDemo {
  private redraw(): void {
  }

  build() {
    Canvas(this.ctx)
      .width('100%')
      .height('100%')
      .onReady(() => {
        this.redraw();
      })
  }
}
