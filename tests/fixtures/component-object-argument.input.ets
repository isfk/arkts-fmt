@Component
struct ObjectArgumentDemo {
  build() {
    ChartContainer({
      chartConfig: this.chartConfig,
      rawData: this.data
      })
    .width('100%')
    .height('100%')
  }
}
