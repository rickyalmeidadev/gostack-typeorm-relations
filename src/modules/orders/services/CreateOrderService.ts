import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExists = await this.customersRepository.findById(customer_id);

    if (!customerExists) {
      throw new AppError('Customer not found');
    }

    const foundProducts = await this.productsRepository.findAllById(products);

    if (foundProducts.length === 0) {
      throw new AppError('Products not found');
    }

    const foundProductsIds = foundProducts.map(product => product.id);

    const nonExistentProducts = products
      .filter(product => !foundProductsIds.includes(product.id))
      .map(product => product.id);

    if (nonExistentProducts.length !== 0) {
      throw new AppError(
        `Could not find products: ${nonExistentProducts.join(', ')}`,
      );
    }

    const foundUnavailableProducts = products
      .filter(product => {
        const target = foundProducts.find(
          foundProduct => foundProduct.id === product.id,
        );

        if (!target) return false;

        return target.quantity < product.quantity;
      })
      .map(product => product.id);

    if (foundUnavailableProducts.length !== 0) {
      throw new AppError(
        `Unavailable quantity for products: ${foundUnavailableProducts.join(
          ', ',
        )}`,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: foundProducts.find(foundProduct => foundProduct.id === product.id)
        ?.price as number,
    }));

    const order = await this.ordersRepository.create({
      customer: customerExists,
      products: serializedProducts,
    });

    const orderedProductsQuantity = products.map(product => ({
      id: product.id,
      quantity:
        (foundProducts.find(foundProduct => foundProduct.id === product.id)
          ?.quantity as number) - product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
