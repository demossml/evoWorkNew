CREATE TABLE `deadStocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_uuid` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`sold` integer NOT NULL,
	`mark` text,
	`lastSaleDate` text,
	`moveCount` integer,
	`moveToStore` text,
	`document_number` text NOT NULL,
	`document_date` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deadStocks_shop_uuid_idx` ON `deadStocks` (`shop_uuid`);--> statement-breakpoint
CREATE INDEX `deadStocks_document_number_idx` ON `deadStocks` (`document_number`);--> statement-breakpoint
CREATE INDEX `deadStocks_document_date_idx` ON `deadStocks` (`document_date`);