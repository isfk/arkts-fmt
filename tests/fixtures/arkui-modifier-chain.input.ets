@Component
struct ModifierDemo {
  @State enabled: boolean = true

  build() {
    if (this.enabled) {
      Column()
      .width('100%')
      .height('100%')
    }
  }
}
