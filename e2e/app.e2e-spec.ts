import { BulbPage } from './app.po';

describe('bulb App', function() {
  let page: BulbPage;

  beforeEach(() => {
    page = new BulbPage();
  });

  it('should display message saying app works', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('app works!');
  });
});
