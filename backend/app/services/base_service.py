"""
Base CRUD Service
Reusable service pattern for all entities
"""

from typing import TypeVar, Generic, Optional, Type, Any
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorCollection
from pydantic import BaseModel
from datetime import datetime, timezone

from app.schemas.common import PaginationMeta, create_pagination_meta
from app.models.common import utc_now

T = TypeVar("T", bound=BaseModel)


class BaseService(Generic[T]):
    """
    Base service with CRUD operations for MongoDB collections

    Provides:
    - Create, read, update, delete operations
    - Business-scoped queries (multi-tenant)
    - Soft delete support
    - Pagination
    """

    def __init__(
        self,
        db: AsyncIOMotorDatabase,
        collection_name: str,
        model_class: Type[T],
        id_field: str = "id"
    ):
        self.db = db
        self.collection: AsyncIOMotorCollection = db[collection_name]
        self.model_class = model_class
        self.id_field = id_field

    async def create(self, data: dict, business_id: Optional[str] = None) -> T:
        """
        Create a new document

        Args:
            data: Document data
            business_id: Business ID for multi-tenant scoping

        Returns:
            Created document as model instance
        """
        if business_id:
            data["business_id"] = business_id

        data["created_at"] = utc_now()
        data["updated_at"] = utc_now()

        await self.collection.insert_one(data)
        return self.model_class(**data)

    async def get_by_id(
        self,
        doc_id: str,
        business_id: Optional[str] = None,
        include_deleted: bool = False
    ) -> Optional[T]:
        """
        Get document by ID

        Args:
            doc_id: Document ID
            business_id: Business ID filter (for multi-tenant security)
            include_deleted: Whether to include soft-deleted documents

        Returns:
            Document as model instance or None
        """
        query = {self.id_field: doc_id}

        if business_id:
            query["business_id"] = business_id

        if not include_deleted:
            query["deleted_at"] = None

        doc = await self.collection.find_one(query)
        return self.model_class(**doc) if doc else None

    async def get_many(
        self,
        business_id: Optional[str] = None,
        filters: Optional[dict] = None,
        page: int = 1,
        per_page: int = 20,
        sort_by: str = "created_at",
        sort_order: int = -1,
        include_deleted: bool = False
    ) -> tuple[list[T], PaginationMeta]:
        """
        Get paginated list of documents

        Args:
            business_id: Business ID filter
            filters: Additional query filters
            page: Page number (1-indexed)
            per_page: Items per page
            sort_by: Field to sort by
            sort_order: 1 for ascending, -1 for descending
            include_deleted: Whether to include soft-deleted documents

        Returns:
            Tuple of (list of documents, pagination metadata)
        """
        query = filters.copy() if filters else {}

        if business_id:
            query["business_id"] = business_id

        if not include_deleted:
            query["deleted_at"] = None

        # Count total
        total = await self.collection.count_documents(query)

        # Calculate skip
        skip = (page - 1) * per_page

        # Fetch documents
        cursor = self.collection.find(query)
        cursor = cursor.sort(sort_by, sort_order)
        cursor = cursor.skip(skip).limit(per_page)

        docs = await cursor.to_list(length=per_page)
        items = [self.model_class(**doc) for doc in docs]

        meta = create_pagination_meta(total, page, per_page)

        return items, meta

    async def update(
        self,
        doc_id: str,
        data: dict,
        business_id: Optional[str] = None
    ) -> Optional[T]:
        """
        Update document by ID

        Args:
            doc_id: Document ID
            data: Fields to update
            business_id: Business ID filter (for security)

        Returns:
            Updated document or None if not found
        """
        query = {self.id_field: doc_id, "deleted_at": None}

        if business_id:
            query["business_id"] = business_id

        # Remove None values to avoid overwriting with null
        update_data = {k: v for k, v in data.items() if v is not None}
        update_data["updated_at"] = utc_now()

        result = await self.collection.find_one_and_update(
            query,
            {"$set": update_data},
            return_document=True
        )

        return self.model_class(**result) if result else None

    async def delete(
        self,
        doc_id: str,
        business_id: Optional[str] = None,
        soft: bool = True
    ) -> bool:
        """
        Delete document by ID

        Args:
            doc_id: Document ID
            business_id: Business ID filter
            soft: If True, soft delete (set deleted_at). If False, hard delete.

        Returns:
            True if deleted, False if not found
        """
        query = {self.id_field: doc_id}

        if business_id:
            query["business_id"] = business_id

        if soft:
            query["deleted_at"] = None
            result = await self.collection.update_one(
                query,
                {"$set": {"deleted_at": utc_now(), "updated_at": utc_now()}}
            )
            return result.modified_count > 0
        else:
            result = await self.collection.delete_one(query)
            return result.deleted_count > 0

    async def restore(
        self,
        doc_id: str,
        business_id: Optional[str] = None
    ) -> Optional[T]:
        """
        Restore soft-deleted document

        Args:
            doc_id: Document ID
            business_id: Business ID filter

        Returns:
            Restored document or None
        """
        query = {self.id_field: doc_id, "deleted_at": {"$ne": None}}

        if business_id:
            query["business_id"] = business_id

        result = await self.collection.find_one_and_update(
            query,
            {"$set": {"deleted_at": None, "updated_at": utc_now()}},
            return_document=True
        )

        return self.model_class(**result) if result else None

    async def count(
        self,
        business_id: Optional[str] = None,
        filters: Optional[dict] = None,
        include_deleted: bool = False
    ) -> int:
        """Count documents matching criteria"""
        query = filters.copy() if filters else {}

        if business_id:
            query["business_id"] = business_id

        if not include_deleted:
            query["deleted_at"] = None

        return await self.collection.count_documents(query)

    async def exists(
        self,
        doc_id: str,
        business_id: Optional[str] = None
    ) -> bool:
        """Check if document exists"""
        query = {self.id_field: doc_id, "deleted_at": None}

        if business_id:
            query["business_id"] = business_id

        return await self.collection.count_documents(query, limit=1) > 0
