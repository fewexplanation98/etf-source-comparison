# ETF source comparison

First test on one ETF only:
- iShares Core MSCI World UCITS ETF USD (Acc)
- ISIN: IE00B4L5Y983
- Yahoo ticker: EUNL.DE

Sources:
- justETF -> read the displayed performance number for 1D / 1M / YTD
- L&S -> calculate 1D from current price vs previous close
- Yahoo -> calculate 1D / 1M / YTD from quote + historical data

Run:
- GitHub Actions
- Action name: "Run ETF source comparison"

Outputs:
- output/msci-world-results.json
- output/msci-world-results.csv
