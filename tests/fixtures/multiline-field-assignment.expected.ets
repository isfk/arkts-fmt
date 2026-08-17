@Component
struct AssignmentDemo {
  @Local auctionLineConfig: LineSeriesConfig =
    new LineSeriesConfig('#008BFA', 1.5, false, '竞价价格');

  build() {
    Blank()
  }
}
